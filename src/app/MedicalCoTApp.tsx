"use client";

import { useState } from "react";
import { InferenceClient } from "@huggingface/inference";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function MedicalCoTApp() {
  const [image, setImage] = useState<File | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<"gpt4o" | "llava">("llava");

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      const canvas = document.createElement("canvas");
      const reader = new FileReader();

      reader.onload = (e) => {
        if (!e.target?.result) return;
        img.src = e.target.result as string;
      };

      img.onload = () => {
        const maxWidth = 1024;
        const maxHeight = 1024;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;
          if (aspectRatio > 1) {
            width = maxWidth;
            height = maxWidth / aspectRatio;
          } else {
            height = maxHeight;
            width = maxHeight * aspectRatio;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          }
        }, "image/jpeg", 0.7);
      };

      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async () => {
    if (!image) return;
    setLoading(true);
    const start = Date.now();

    try {
      const compressed = await compressImage(image);
      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64Image = reader.result?.toString().split(",")[1];
        if (!base64Image) throw new Error("图像 base64 编码失败");

        let response;
        const duration = ((Date.now() - start) / 1000).toFixed(1);

        if (provider === "gpt4o") {
          const payload = {
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `你是一位专业的医学影像讲师，请根据图像进行结构观察与教学分析，不进行医学诊断。\n请描述图像中的结构异常、特征性区域、影像对称性、密度变化等，并提出可能值得进一步检查的方向。`
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${base64Image}`
                    }
                  }
                ]
              }
            ],
            max_tokens: 1000
          };

          response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`
            },
            body: JSON.stringify(payload)
          });
        } else {
          const client = new InferenceClient(process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY);
          const chatCompletion = await client.chatCompletion({
            provider: "nebius",
            model: "llava-hf/llava-1.5-13b-hf",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `你是一位具有丰富临床经验的医学影像科医生，请根据以下医学图像完成以下任务：

1. 识别图像中的结构异常，包括但不限于肿块、阴影、结节、实变、积液、钙化、气胸等。
2. 对每一个异常区域，描述其解剖位置、形态边界、密度变化、对称性等影像特征。
3. 综合影像表现，给出可能的初步诊断，并尽量使用专业医学术语（如 ICD-10 或常用放射学名词）。
4. 如果存在不确定性，请列出合理的鉴别诊断选项，并简要说明推理依据。
5. 给出建议的下一步临床处理方式，例如是否建议增强CT、MRI、病理检查或随访。
6. 最后，请展示你的完整思考过程，从图像观察、假设生成、证据支持到最终推理结论，形成完整的推理链条。

请以结构化、分点的中文输出回答，避免冗长叙述。`
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${base64Image}`
                    }
                  }
                ]
              }
            ]
          });

          response = { ok: true, json: async () => chatCompletion };
        }

        if (!response.ok) {
          const errorText = await response.text();
          setDiagnosis(`❌ 请求失败：${response.status} ${response.statusText}\n${errorText}`);
          setReasoning("");
          setLoading(false);
          return;
        }

        const data = await response.json();
        const content =
          provider === "gpt4o"
            ? data.choices?.[0]?.message?.content || "（无响应内容）"
            : data.choices?.[0]?.message?.content || "（无响应内容）";
        const lines = content.split("\n").filter(Boolean);
        setDiagnosis(`${lines[0]}\n\n⏱️ 响应时间：${duration} 秒`);
        setReasoning(lines.slice(1).join("\n"));
        setLoading(false);
      };

      reader.readAsDataURL(compressed);
    } catch (err: any) {
      setDiagnosis(`⚠️ 网络或Key问题：${err.message}`);
      setReasoning("");
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">医学影像推理演示平台</h1>
      <div className="mb-4 flex gap-2 items-center">
        <span className="font-medium">选择模型：</span>
        <Button
  variant={provider === "gpt4o" ? "default" : "outline"}
  onClick={() => setProvider("gpt4o")}
  className={provider === "gpt4o" ? "ring-2 ring-blue-500" : ""}
>
  医学讲解助手
</Button>
        <Button
  variant={provider === "llava" ? "default" : "outline"}
  onClick={() => setProvider("llava")}
  className={provider === "llava" ? "ring-2 ring-green-500" : ""}
>
  智能诊断模型
</Button>
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files?.[0] || null)}
          />
          <Button onClick={handleUpload} disabled={loading}>
            {loading ? "诊断中..." : "上传图像并诊断"}
          </Button>
        </CardContent>
      </Card>

      {diagnosis && (
        <Card className="mb-4">
          <CardContent>
            <h2 className="text-xl font-semibold mb-2">诊断结论</h2>
            <p className="text-sm italic text-gray-500 mb-2">当前使用模型：{provider === "gpt4o" ? "医学讲解助手" : "智能诊断模型"}</p>
            <p className="whitespace-pre-wrap">{diagnosis}</p>
          </CardContent>
        </Card>
      )}

      {reasoning && (
        <Card className="mb-4">
          <CardContent>
            <h2 className="text-xl font-semibold mb-2">推理链条</h2>
            <Textarea readOnly className="h-40" value={reasoning} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

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
                    text: `你是一位医学图像智能分析助手，请参考图像内容进行深入医学解读与分析。你可以识别结构变化、密度分布、对称性、病变特征等，提供类医学分析建议和教学参考内容。你可以输出推测性描述和结构化内容。

请完成以下任务：
1. 识别图像中的解剖结构和可能存在的异常区域。
2. 描述可疑区域的边界、密度、位置、分布等特征。
3. 提出可能的医学解释（不作为诊断），使用专业术语。
4. 输出完整的分析推理过程，包括观察、假设、证据支持与结论形成。`
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
                    text: `你是一位具备放射学专业知识的医学影像分析专家。请根据以下医学图像，按照如下固定结构格式，输出清晰、有条理的分析结果：

【结构异常识别】
- 区域1：位置（xx部位），异常类型（如实变、结节、肿块等），密度（增高/减低），边界（清晰/模糊），对称性（对称/不对称）。
- 区域2：……

【影像特征总结】
- 影像中主要异常集中在：（描述异常部位与结构）
- 异常类型包括：（列出如肿块、钙化、气胸等）
- 可疑病变形态：（例如：分叶状、磨玻璃密度、边缘毛刺等）

【推测性诊断（非医学结论）】
- 初步推测1：xxx（ICD-10名词）
- 鉴别诊断：xxx 与 xxx 的主要区别在于……（如必要）

【处理建议】
- 建议进一步检查：CT增强/MRI/随访
- 建议临床结合：症状、实验室检查、病史

【推理链条】
请展示你的思考过程，从图像观察→结构识别→证据分析→假设提出→诊断建议。`
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
  onClick={() => setProvider("gpt4o")}
  className={`px-4 py-2 border rounded ${provider === "gpt4o" ? "bg-blue-600 text-white" : "bg-white text-gray-800 border-gray-300"}`}
>
  医学讲解助手
</Button>
        <Button
  onClick={() => setProvider("llava")}
  className={`px-4 py-2 border rounded ${provider === "llava" ? "bg-green-600 text-white" : "bg-white text-gray-800 border-gray-300"}`}
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

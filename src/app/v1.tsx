"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function MedicalCoTApp() {
  const [image, setImage] = useState<File | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [loading, setLoading] = useState(false);

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

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`
          },
          body: JSON.stringify(payload)
        });

        const duration = ((Date.now() - start) / 1000).toFixed(1);

        if (!res.ok) {
          const errorText = await res.text();
          setDiagnosis(`❌ 请求失败：${res.status} ${res.statusText}\n${errorText}`);
          setReasoning("");
          setLoading(false);
          return;
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "（无响应内容）";
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

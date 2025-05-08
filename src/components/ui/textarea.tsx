"use client";

import React from "react";

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="border px-3 py-2 rounded w-full resize-none focus:outline-none focus:ring focus:border-blue-300"
    />
  );
}

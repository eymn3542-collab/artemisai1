import { GoogleGenAI, GenerateContentResponse, ThinkingLevel, Modality, Type, FunctionDeclaration } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const generateImageTool: FunctionDeclaration = {
  name: "generateImage",
  description: "Kullanıcının isteğine göre yapay zeka ile görsel oluşturur.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: "Oluşturulacak görselin detaylı İngilizce açıklaması.",
      },
    },
    required: ["prompt"],
  },
};

export interface Message {
  role: "user" | "model";
  content: string;
  id: string;
  timestamp: number;
  image?: {
    data: string;
    mimeType: string;
  };
  groundingLinks?: { title: string, uri: string }[];
}

export const chatWithGemini = async (message: string, history: Message[]) => {
  const recentHistory = history.slice(-4);
  const geminiHistory = recentHistory.map(msg => ({
    role: msg.role,
    parts: [
      { text: msg.content },
      ...(msg.image ? [{ inlineData: { data: msg.image.data, mimeType: msg.image.mimeType } }] : [])
    ]
  }));

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    history: geminiHistory,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: "Sen Artemis'sin. EyMIND şirketi tarafından geliştirilmiş, güçlü, zeki ve hızlı bir yapay zeka asistanısın. İnternet erişimin ve görsel oluşturma yeteneklerin var. Görsel oluşturmak için 'generateImage' fonksiyonunu kullanmalısın. ASLA manuel JSON formatında çıktı verme, sadece fonksiyonu çağır. Her zaman Türkçe konuşursun.",
      temperature: 0.4,
      tools: [{ googleSearch: {} }, { functionDeclarations: [generateImageTool] }],
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};

export const streamChatWithGemini = async (message: string, history: Message[], image?: { data: string, mimeType: string }) => {
  const recentHistory = history.slice(-4);
  const geminiHistory = recentHistory.map(msg => ({
    role: msg.role,
    parts: [
      { text: msg.content },
      ...(msg.image ? [{ inlineData: { data: msg.image.data, mimeType: msg.image.mimeType } }] : [])
    ]
  }));

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    history: geminiHistory,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: "Sen Artemis'sin. EyMIND şirketi tarafından geliştirilmiş, güçlü, zeki ve hızlı bir yapay zeka asistanısın. İnternet erişimin ve görsel oluşturma yeteneklerin var. Görsel oluşturmak için 'generateImage' fonksiyonunu kullanmalısın. ASLA manuel JSON formatında çıktı verme, sadece fonksiyonu çağır. Her zaman Türkçe konuşursun.",
      temperature: 0.4,
      tools: [{ googleSearch: {} }, { functionDeclarations: [generateImageTool] }],
    },
  });

  const parts: any[] = [{ text: message }];
  if (image) {
    parts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
  }

  const response = await chat.sendMessageStream({ message: { parts } } as any);
  return response;
};

export const generateImageWithGemini = async (prompt: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Görsel oluşturulamadı.");
};

export const textToSpeech = async (text: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say cheerfully: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    return `data:audio/wav;base64,${base64Audio}`;
  }
  return null;
};

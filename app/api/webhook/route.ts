import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_not_upsert' });
    }

    const isFromMe = body.data?.key?.fromMe;
    const userMessage = body.data?.message?.conversation || 
                       body.data?.message?.extendedTextMessage?.text;

    if (!userMessage) {
      return NextResponse.json({ status: 'no_text_content' });
    }

    // Trava de segurança: responde estritamente às mensagens enviadas por você
    if (!isFromMe) {
      return NextResponse.json({ status: 'ignored_third_party_message' });
    }

    const remoteJid = body.data?.key?.remoteJid || '';
    const cleanNumber = remoteJid.split('@')[0];

    const systemInstruction = "Você é um assistente pessoal de rotina fitness e nutrição focado no acompanhamento diário.\n" +
      "Perfil do usuário:\n" +
      "- Foco: Perda de gordura e ganho de massa muscular.\n" +
      "- Metas diárias: 3,5L de água e 160g de proteína.\n" +
      "- Treinos: 30 min (3x/semana).\n" +
      "- Atenção: Uso de medicação que reduz o apetite (Venvanse); garanta o aporte proteico e hídrico mesmo sem fome.\n" +
      "- Estilo de resposta: Direto, prático e motivador (pouco tempo disponível no dia a dia).\n\n" +
      "Sua tarefa: Responder ao usuário e extrair dados se ele informar consumo de refeição, água, peso ou treino.";

    const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: systemInstruction,
});

    const result = await model.generateContent(userMessage);
    const botResponse = result.response.text();

    const targetUrl = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`;

    await axios.post(
      targetUrl,
      {
        number: cleanNumber,
        text: botResponse,
      },
      {
        headers: {
          apikey: process.env.EVOLUTION_API_KEY,
        },
      }
    );

    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro detalhado no Webhook:', error?.response?.data || error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
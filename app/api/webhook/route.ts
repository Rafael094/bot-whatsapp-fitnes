import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_not_upsert' });
    }

    const isFromMe = body.data?.key?.fromMe;
    const userMessage = body.data?.message?.conversation || 
                       body.data?.message?.extendedTextMessage?.text;

    if (!userMessage) {
      return NextResponse.json({ status: 'no_text_content' });
    }

    if (!isFromMe) {
      return NextResponse.json({ status: 'ignored_third_party_message' });
    }

    const remoteJid = body.data?.key?.remoteJid || '';
    const cleanNumber = remoteJid.replace(/[^0-9]/g, '');

    // Validação da API Key do Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY_MISSING' }, { status: 200 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);

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

    let baseUrl = process.env.EVOLUTION_API_URL || '';
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    const targetUrl = `${baseUrl.replace(/\/$/, '')}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`;

    if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
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
      ).catch((err) => {
        console.error('Erro na Evolution API:', err?.response?.data || err.message);
      });
    }

    return NextResponse.json({ status: 'success', geminiResponse: botResponse });

  } catch (error: any) {
    // Retorna o texto exato da exceção para visualizarmos diretamente no PowerShell
    return NextResponse.json({ 
      error_captured: true,
      message: error?.message || 'Erro desconhecido',
      stack: error?.stack || null 
    }, { status: 200 });
  }
}
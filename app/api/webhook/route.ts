import { NextResponse } from 'next/server';
import axios from 'axios';

// ID exato do seu grupo "Acompanhamento Fitness"
const ALLOWED_GROUP_ID = '120363408558611091@g.us';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_not_upsert' });
    }

    const remoteJid = body.data?.key?.remoteJid || '';

    // TRAVA 1: Ignora qualquer mensagem que não venha de um grupo
    if (!remoteJid.endsWith('@g.us')) {
      return NextResponse.json({ status: 'ignored_private_chat' });
    }

    // TRAVA 2: Responde apenas se for no seu grupo específico "Acompanhamento Fitness"
    // (Caso queira permitir qualquer grupo que você criar no futuro, comente a condição abaixo)
    if (remoteJid !== ALLOWED_GROUP_ID) {
      return NextResponse.json({ status: 'ignored_unauthorized_group' });
    }

    const userMessage = body.data?.message?.conversation || 
                       body.data?.message?.extendedTextMessage?.text;

    if (!userMessage) {
      return NextResponse.json({ status: 'no_text_content' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY_MISSING' }, { status: 200 });
    }

    const systemInstruction = "Você é um assistente pessoal de rotina fitness e nutrição focado no acompanhamento diário.\n" +
      "Perfil do usuário:\n" +
      "- Foco: Perda de gordura e ganho de massa muscular.\n" +
      "- Metas diárias: 3,5L de água e 160g de proteína.\n" +
      "- Treinos: 30 min (3x/semana).\n" +
      "- Estilo de resposta: Direto, prático e motivador.\n\n" +
      "Sua tarefa: Responder ao usuário e extrair dados se ele informar consumo de refeição, água, peso ou treino.";

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: userMessage }] }]
      })
    });

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return NextResponse.json({ 
        error_captured: true, 
        message: geminiData?.error?.message || 'Erro na API do Gemini'
      }, { status: 200 });
    }

    const botResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta gerada.';

    let baseUrl = process.env.EVOLUTION_API_URL || '';
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    const targetUrl = `${baseUrl.replace(/\/$/, '')}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`;

    if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
      await axios.post(
        targetUrl,
        {
          number: remoteJid, // Envia estritamente para o ID do grupo autorizado
          text: botResponse,
        },
        {
          headers: { apikey: process.env.EVOLUTION_API_KEY },
        }
      ).catch((err) => {
        console.error('Erro na Evolution API:', err?.response?.data || err.message);
      });
    }

    return NextResponse.json({ status: 'success', geminiResponse: botResponse });

  } catch (error: any) {
    return NextResponse.json({ 
      error_captured: true,
      message: error?.message || 'Erro desconhecido'
    }, { status: 200 });
  }
}
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log('--- NOVO EVENTO RECEBIDO ---');
    console.log('Event:', body.event);
    console.log('Data:', JSON.stringify(body.data));

    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_not_upsert' });
    }

    const isFromMe = body.data?.key?.fromMe;
    const userMessage = body.data?.message?.conversation || 
                       body.data?.message?.extendedTextMessage?.text;

    // Se não houver mensagem de texto ou se não for enviada por você, ignora
    if (!userMessage) {
      return NextResponse.json({ status: 'no_text_content' });
    }

    if (!isFromMe) {
      return NextResponse.json({ status: 'ignored_third_party_message' });
    }

    // Extrai o número do remetente original
    const remoteJid = body.data?.key?.remoteJid || '';
    const cleanNumber = remoteJid.split('@')[0];

    const systemPrompt = "Voce e um assistente pessoal de rotina fitness e nutricao focado no acompanhamento diario.\n" +
      "Perfil do usuario:\n" +
      "- Foco: Perda de gordura e ganho de massa.\n" +
      "- Metas diarias: 3,5L de agua e 160g de proteina.\n" +
      "- Treinos: 30 min (3x/semana).\n" +
      "- Atencao: Uso de medicacao que reduz apetite (Venvanse); garanta o aporte proteico e hidrico mesmo sem fome.\n" +
      "- Estilo de resposta: Direto, pratico e motivador (pouco tempo disponivel no dia a dia).\n\n" +
      "Sua tarefa: Responder ao usuario e extrair dados se ele informar consumo de refeicao, agua, peso ou treino.";

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
    });

    const botResponse = completion.choices[0].message.content;

    const targetUrl = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`;

    console.log('Enviando resposta para:', cleanNumber);

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
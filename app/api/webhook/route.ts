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

// Configure o seu número de telefone pessoal com DDD (apenas números, ex: 554384026113)
const MY_PHONE_NUMBER = '554384026113';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Aceita apenas eventos de nova mensagem
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored' });
    }

    const remoteJid = body.data?.key?.remoteJid || '';
    const isFromMe = body.data?.key?.fromMe;
    const senderNumber = remoteJid.replace('@s.whatsapp.net', '');

    // TRAVA DE SEGURANÇA PARA USO PESSOAL:
    // Só processa se a mensagem for enviada na conversa 'Você' (consigo mesmo)
    // Se outra pessoa mandar mensagem, o bot ignora totalmente para não interferir nas suas conversas.
    const isNoteToSelf = isFromMe && senderNumber.includes(MY_PHONE_NUMBER);

    if (!isNoteToSelf) {
      return NextResponse.json({ status: 'ignored_external_user' });
    }

    const userMessage = body.data.message?.conversation || 
                       body.data.message?.extendedTextMessage?.text;

    if (!userMessage) {
      return NextResponse.json({ status: 'no_text' });
    }

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

    const targetUrl = process.env.EVOLUTION_API_URL + '/message/sendText/' + process.env.EVOLUTION_INSTANCE_NAME;

    await axios.post(
      targetUrl,
      {
        number: senderNumber,
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
    console.error('Erro no Webhook:', error?.response?.data || error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
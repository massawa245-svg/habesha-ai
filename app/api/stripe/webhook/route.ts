import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.text();
  const signature = req.headers.get('stripe-signature')!;
  
  try {
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      
      if (userId) {
        // User auf Premium setzen
        await supabase
          .from('trusted_users')
          .upsert({
            user_id: userId,
            email: session.customer_email,
            role: 'premium',
            active: true,
          });
        
        console.log(`✅ Premium aktiviert für: ${userId}`);
      }
    }
    
    return NextResponse.json({ received: true });
    
  } catch (error) {
    console.error('Stripe Webhook Error:', error);
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }
}
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature')!;
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: 'Webhook Fehler' }, { status: 400 });
  }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    
    if (userId) {
      const premiumUntil = new Date();
      premiumUntil.setDate(premiumUntil.getDate() + 30);
      
      await supabase
        .from('user_limits')
        .update({ 
          premium: true, 
          premium_until: premiumUntil.toISOString().split('T')[0],
          stripe_subscription_id: session.subscription
        })
        .eq('user_id', userId);
    }
  }
  
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const { data: userLimit } = await supabase
      .from('user_limits')
      .select('user_id')
      .eq('stripe_subscription_id', subscription.id)
      .single();
    
    if (userLimit) {
      await supabase
        .from('user_limits')
        .update({ premium: false, premium_until: null })
        .eq('user_id', userLimit.user_id);
    }
  }
  
  return NextResponse.json({ received: true });
}
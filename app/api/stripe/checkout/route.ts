import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { userId, email } = await req.json();
    
    if (!userId || !email) {
      return NextResponse.json({ error: 'Fehlende Daten' }, { status: 400 });
    }
    
    // Hole oder erstelle Stripe Customer
    let { data: userLimit } = await supabase
      .from('user_limits')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();
    
    let customerId = userLimit?.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
      await supabase
        .from('user_limits')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userId);
    }
    
    // Checkout Session erstellen
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Habesha AI Premium',
              description: 'Unbegrenzte Brief-Analysen + alle Features',
            },
            unit_amount: 999, // 9,99€
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/premium-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/premium-cancel`,
      metadata: { userId },
    });
    
    return NextResponse.json({ url: session.url });
    
  } catch (error) {
    console.error('Stripe Fehler:', error);
    return NextResponse.json({ error: 'Fehler bei Zahlung' }, { status: 500 });
  }
}
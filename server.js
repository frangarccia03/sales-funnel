require('dotenv').config();
const express = require('express');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');

async function callClaude(system, messages) {
  const res = await fetch(ANTHROPIC_BASE + '/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// ===================== PRODUCT CONFIGURATION =====================
// Edit this array to change what the chatbot sells.
// Mix your own digital products with affiliate offers.
const PRODUCTS = [
  {
    id: 'ai-sales-funnel-blueprint',
    name: 'AI Sales Funnel Blueprint',
    type: 'digital',
    price: 37,
    url: 'https://sfsystemsai.gumroad.com/l/sales-funnel',
    tags: ['blueprint', 'node.js', 'claude', 'chatbot', 'lead scoring'],
    description: 'Full Node.js + Claude API sales funnel with chatbot widget, admin dashboard, and lead scoring engine. Instant download.',
    ideal_for: 'founders and developers who want to build their own AI sales funnel in minutes',
  },
  {
    id: 'ai-business-prompts',
    name: 'AI Business Prompts Pack',
    type: 'digital',
    price: 17,
    url: 'https://sfsystemsai.gumroad.com/l/prompt-ai',
    tags: ['prompts', 'chatgpt', 'claude', 'marketing', 'sales'],
    description: '100+ proven prompts for ChatGPT and Claude covering marketing, sales, content, email, SEO, and business strategy.',
    ideal_for: 'entrepreneurs and marketers who want ready-to-use AI prompts that actually deliver results',
  },
  {
    id: 'linkedin-lead-machine',
    name: 'LinkedIn Lead Machine',
    type: 'digital',
    price: 27,
    url: 'https://sfsystemsai.gumroad.com/l/qnxjpv',
    tags: ['linkedin', 'leads', 'outreach', 'messaging', 'profile'],
    description: 'Complete LinkedIn lead generation playbook with 50+ message templates, profile guide, and content strategy calendar.',
    ideal_for: 'founders and sales pros who want to generate consistent leads from LinkedIn',
  },
  {
    id: 'chatgpt-content-engine',
    name: 'ChatGPT Content Engine',
    type: 'digital',
    price: 27,
    url: 'https://sfsystemsai.gumroad.com/l/rubteel',
    tags: ['content', 'blog', 'social media', 'email', 'video scripts'],
    description: '50+ blog post templates, social media calendars, email newsletter templates, and video script templates for ChatGPT.',
    ideal_for: 'content creators and business owners who want to produce high-quality content faster',
  },
  {
    id: 'business-automation-scripts',
    name: 'Business Automation Scripts',
    type: 'digital',
    price: 47,
    url: 'https://sfsystemsai.gumroad.com/l/wjhkp',
    tags: ['automation', 'scraping', 'crm', 'analytics', 'webhooks'],
    description: 'Production-ready Node.js scripts: LinkedIn lead scraper, email automation, CRM integration, analytics dashboard, and more.',
    ideal_for: 'tech-savvy founders and agencies who want to automate their business operations',
  },
  {
    id: 'ai-email-toolkit',
    name: 'AI Email Marketing Toolkit',
    type: 'digital',
    price: 17,
    url: 'https://yourbrand.gumroad.com/l/ai-email-toolkit',
    tags: ['email', 'sequences', 'campaigns', 'newsletter', 'subject lines'],
    description: '5 welcome sequences, 10 nurture campaigns, 5 sales sequences, reactivation campaigns, and AI subject line generator.',
    ideal_for: 'business owners who want proven email templates to convert and retain customers',
  },
  {
    id: 'ai-sales-scripts',
    name: 'AI Sales Script Library',
    type: 'digital',
    price: 27,
    url: 'https://yourbrand.gumroad.com/l/ai-sales-scripts',
    tags: ['sales', 'scripts', 'objections', 'closing', 'discovery'],
    description: '50+ sales conversation scripts covering discovery calls, objection handling, closing tactics, and follow-up sequences.',
    ideal_for: 'sales professionals and founders who want battle-tested scripts to close more deals',
  },
  {
    id: 'social-media-ai-bundle',
    name: 'Social Media AI Bundle',
    type: 'digital',
    price: 37,
    url: 'https://yourbrand.gumroad.com/l/social-media-ai-bundle',
    tags: ['social media', 'content calendar', 'prompts', 'growth', 'analytics'],
    description: '30-day content calendars, AI prompt templates per platform, posting schedules, growth guides, and analytics tracker.',
    ideal_for: 'business owners and marketers who want a complete social media system powered by AI',
  },
];

// ===================== DATA =====================
const leads = new Map();  // id -> Lead
const conversations = new Map(); // leadId -> [{role, content, time}]

function getLeadByEmail(email) {
  for (const [, l] of leads) if (l.email === email) return l;
  return null;
}

// ===================== CHATBOT =====================
app.post('/api/chat', async (req, res) => {
  const { message, leadId } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  let lead;
  if (leadId && leads.has(leadId)) {
    lead = leads.get(leadId);
  } else {
    lead = { id: leadId || uuid().slice(0, 8), name: '', email: '', phone: '', score: 0, status: 'new', createdAt: new Date(), lastMessage: new Date(), tags: [], product: null, notes: [] };
    if (!leadId) leads.set(lead.id, lead);
    else leads.set(leadId, lead);
  }
  if (!conversations.has(lead.id)) conversations.set(lead.id, []);
  const conv = conversations.get(lead.id);
  conv.push({ role: 'user', content: message, time: new Date() });
  lead.lastMessage = new Date();

  const productsInfo = PRODUCTS.map(p =>
    `- ${p.name} ($${p.price}): ${p.description}. Best for: ${p.ideal_for}`
  ).join('\n');

  const history = conv.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');

  try {
    const systemPrompt = `You are a sharp AI sales assistant for Predictive Scale AI.

YOUR GOAL:
1. Understand what the visitor needs
2. Recommend the single best-fit product from this list:
${productsInfo}

3. Capture their name, email, and optionally phone
4. If they show interest, tell them the price and offer to follow up

YOUR TONE:
- Warm, direct, conversational. Short sentences. One question at a time.
- Sound like a knowledgeable human, never like a brochure.
- Mirror the visitor's level of formality.

HARD RULES:
- Never invent prices, features, or guarantees. Only use the catalog above.
- Never recommend more than one offer at a time. Pick the best fit.
- Never be pushy. If they are not ready, offer a resource and ask for the email.
- If you don't know something, say so and offer a human follow-up.
- Respond in English.
- No markdown, no emojis.`;

    const reply = await callClaude(systemPrompt, [{ role: 'user', content: `History:\n${history}\n\nCustomer message: ${message}` }]);
    conv.push({ role: 'assistant', content: reply, time: new Date() });

    // Extract contact info and product interest
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = message.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
    const nameMatch = message.match(/(?:my name is|i'm|i am|call me)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);

    if (!lead.name && nameMatch) lead.name = nameMatch[1].trim();
    if (!lead.email && emailMatch) lead.email = emailMatch[0];
    if (!lead.phone && phoneMatch) lead.phone = phoneMatch[0];

    if (!lead.name && !lead.email) {
      const greetingMatch = message.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)?)/);
      if (greetingMatch && conv.length <= 2) lead.name = greetingMatch[1].trim();
    }

    const productMentioned = PRODUCTS.find(p =>
      reply.toLowerCase().includes(p.name.toLowerCase()) && /yes|sure|interested|tell me more|how much|buy|purchase/i.test(message)
    );
    if (productMentioned) {
      lead.product = productMentioned.id;
      lead.score = Math.min(lead.score + 3, 10);
    }

    // Score: conversation depth + contact signals + buying intent
    const buyWords = /buy|purchase|price|cost|how much|sign up|start|interested|let's do it/i;
    const urgentWords = /now|today|asap|this week|urgent|ready|immediately/i;
    const hasBuyIntent = buyWords.test(message) || buyWords.test(reply);
    const hasUrgency = urgentWords.test(message);
    lead.score = Math.min(
      Math.floor(conv.length / 3) +
      (lead.email ? 4 : 0) +
      (lead.phone ? 2 : 0) +
      (hasBuyIntent ? 2 : 0) +
      (hasUrgency ? 1 : 0),
      10
    );

    if (lead.email && lead.score >= 5) lead.status = 'qualified';
    if (lead.score >= 7) lead.status = 'hot';

    res.json({ reply, leadId: lead.id, lead: { name: lead.name, email: lead.email, score: lead.score, status: lead.status } });
  } catch (e) {
    res.status(500).json({ error: e.message, reply: 'Something went wrong. Could you repeat that?' });
  }
});

// ===================== ADMIN =====================
const ADMIN_KEY = crypto.randomBytes(16).toString('hex');
console.log('Admin key: ' + ADMIN_KEY);

app.get('/api/admin/leads', (req, res) => {
  if (req.headers['authorization'] !== `Bearer ${ADMIN_KEY}`) return res.status(401).json({ error: 'Unauthorized' });
  const list = [];
  leads.forEach((l, id) => {
    const conv = conversations.get(id) || [];
    list.push({ id, ...l, messages: conv.length, lastMessage: l.lastMessage });
  });
  res.json(list.sort((a, b) => b.score - a.score));
});

app.get('/api/admin/leads/:id', (req, res) => {
  if (req.headers['authorization'] !== `Bearer ${ADMIN_KEY}`) return res.status(401).json({ error: 'Unauthorized' });
  const conv = conversations.get(req.params.id);
  const lead = leads.get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json({ lead, conversation: conv });
});

app.post('/api/admin/leads/:id/note', (req, res) => {
  if (req.headers['authorization'] !== `Bearer ${ADMIN_KEY}`) return res.status(401).json({ error: 'Unauthorized' });
  const lead = leads.get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  lead.notes.push({ text: req.body.note, time: new Date() });
  res.json({ ok: true });
});

app.post('/api/admin/reply/:id', async (req, res) => {
  if (req.headers['authorization'] !== `Bearer ${ADMIN_KEY}`) return res.status(401).json({ error: 'Unauthorized' });
  const lead = leads.get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!conversations.has(lead.id)) conversations.set(lead.id, []);
  const conv = conversations.get(lead.id);
  conv.push({ role: 'assistant', content: req.body.message, time: new Date() });
  res.json({ ok: true });
});

// ===================== HOT LEAD NOTIFICATION =====================
setInterval(() => {
  const hot = [];
  leads.forEach(l => { if (l.status === 'hot' && l.email) hot.push(l); });
  if (hot.length > 0) {
    console.log(`🔥 Hot leads: ${hot.map(l => l.name || l.email).join(', ')}`);
    // Integrate: Telegram, email, SMS, Slack webhook, etc.
  }
}, 30000);

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
  console.log(`\n🔥 AI Sales Funnel running on http://localhost:${PORT}`);
  console.log(`   Admin: http://localhost:${PORT}/admin.html`);
  console.log(`   Admin key: ${ADMIN_KEY}`);
  console.log(`\nProducts configured:`);
  PRODUCTS.forEach(p => console.log(`   - ${p.name} (${p.type}) $${p.price}`));
});

require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;
const { v4: uuid } = require('uuid');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static('public'));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.ANTHROPIC_BASE_URL || undefined });

// ===================== PRODUCT CONFIGURATION =====================
// Edit this array to change what the chatbot sells.
// Mix your own digital products with affiliate offers.
const PRODUCTS = [
  {
    id: 'clickup',
    name: 'ClickUp — AI Productivity Platform',
    type: 'affiliate',
    commission: 28,
    price: 0,
    url: process.env.CLICKUP_AFFILIATE || 'https://clickup.com/?ref=yourid',
    tags: ['productivity', 'ai', 'project management', 'tasks', 'team'],
    description: 'All-in-one AI-powered productivity app that unifies tasks, docs, goals, and communication. Free tier available. Paid plans from $7/mo.',
    ideal_for: 'solo entrepreneurs, freelancers, and teams who want to centralize their workflow with AI',
  },
  {
    id: 'getresponse',
    name: 'GetResponse — Email Marketing + AI',
    type: 'affiliate',
    commission: 40,
    price: 19,
    url: process.env.GETRESPONSE_AFFILIATE || 'https://getresponse.com/?ref=yourid',
    tags: ['email', 'marketing', 'automation', 'ai', 'newsletter'],
    description: 'All-in-one email marketing platform with AI-powered tools to automate campaigns, build landing pages, and grow your audience',
    ideal_for: 'business owners and marketers who want to automate their email marketing with AI',
  },
  {
    id: 'hostinger',
    name: 'Web Hosting + Free Domain',
    type: 'affiliate',
    commission: 65,
    price: 120,
    url: process.env.HOSTINGER_AFFILIATE || 'https://hostinger.com/?ref=yourid',
    tags: ['hosting', 'web', 'business', 'store', 'domain'],
    description: 'Fast hosting with free SSL, free domain, and 24/7 support. Launch your online business in minutes',
    ideal_for: 'anyone who needs affordable, reliable hosting to get their business online',
  },
  {
    id: 'hubspot',
    name: 'HubSpot — Free CRM',
    type: 'affiliate',
    commission: 30,
    price: 0,
    url: process.env.HUBSPOT_AFFILIATE || 'https://hubspot.com/?ref=yourid',
    tags: ['crm', 'sales', 'marketing', 'ai', 'pipeline'],
    description: 'Free CRM with AI-powered deal scoring, email tracking, meeting scheduler, and live chat. Paid plans from $45/mo.',
    ideal_for: 'founders building a sales process who want a professional CRM without upfront cost',
  },
  {
    id: 'jasper',
    name: 'Jasper AI — AI Writing Assistant',
    type: 'affiliate',
    commission: 30,
    price: 49,
    url: process.env.JASPER_AFFILIATE || 'https://jasper.ai/?ref=yourid',
    tags: ['ai', 'writing', 'content', 'copywriting', 'marketing'],
    description: 'AI writing tool trained on high-converting copy. Generate blog posts, emails, ads, and social content in minutes',
    ideal_for: 'entrepreneurs and marketers who want to produce quality content faster with AI',
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `You are a sharp AI sales assistant for Predictive Scale AI.

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
- No markdown, no emojis.`,
      messages: [{ role: 'user', content: `History:\n${history}\n\nCustomer message: ${message}` }],
    });

    const reply = response.content[0].text;
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

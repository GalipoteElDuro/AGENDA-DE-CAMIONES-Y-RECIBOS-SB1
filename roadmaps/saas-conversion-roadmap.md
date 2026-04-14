# 🚀 Roadmap: Conversión a SaaS - AGENDAO SB1

Este documento detalla la estrategia completa para transformar **AGENDAO SB1** de una aplicación single-tenant a una plataforma **SaaS multi-tenant** escalable, segura y monetizable.

---

## 📋 Tabla de Contenidos

1. [Arquitectura Multi-Tenant](#1-arquitectura-multi-tenant)
2. [Base de Datos y Aislamiento](#2-base-de-datos-y-aislamiento)
3. [Autenticación y Autorización](#3-autenticación-y-autorización)
4. [Infraestructura y Deploy](#4-infraestructura-y-deploy)
5. [Monetización y Planes](#5-monetización-y-planes)
6. [Billing y Suscripciones](#6-billing-y-suscripciones)
7. [Gestión de Tenant](#7-gestión-de-tenant)
8. [Métricas y Analytics](#8-métricas-y-analytics)
9. [Seguridad y Cumplimiento](#9-seguridad-y-cumplimiento)
10. [API y Integraciones](#10-api-y-integraciones)
11. [Onboarding y UX](#11-onboarding-y-ux)
12. [Backup y Recuperación](#12-backup-y-recuperación)
13. [Testing y QA](#13-testing-y-qa)
14. [Roadmap de Implementación](#14-roadmap-de-implementación)

---

## 1. Arquitectura Multi-Tenant

### 1.1 Estrategia de Aislamiento

Existen 3 modelos principales para SaaS multi-tenant:

| Modelo | Descripción | Costo | Complejidad | Aislamiento |
|--------|-------------|-------|-------------|-------------|
| **Database-per-tenant** | BD separada por cliente | Alto | Media | Excelente |
| **Schema-per-tenant** | Schema separado, misma BD | Medio | Alta | Muy bueno |
| **Shared schema** | Todos comparten, `tenant_id` | Bajo | Baja | Bueno (con RLS) |

**✅ Recomendación para AGENDAO SB1:**
- **Fase inicial:** Shared schema con Row Level Security (RLS) en Supabase
- **Fase enterprise:** Opción de schema-per-tenant para clientes premium

### 1.2 Identificación de Tenant

```typescript
// Cada request debe identificar el tenant
// Opciones:
// 1. Subdomain: cliente1.agendaosb1.com
// 2. Path: agendaosb1.com/cliente1
// 3. Header: X-Tenant-ID
// 4. JWT claim: token incluye tenant_id

// Middleware Express para resolver tenant
async function resolveTenant(req, res, next) {
  const subdomain = req.subdomains[0];
  const tenant = await supabase
    .from('tenants')
    .select('*')
    .eq('subdomain', subdomain)
    .single();
  
  req.tenant = tenant;
  next();
}
```

### 1.3 Modificaciones Requeridas

```typescript
// TODOS los queries deben filtrar por tenant_id
// Ejemplo actual (single-tenant):
const { data: bookings } = await supabase.from('bookings').select('*');

// Ejemplo SaaS (multi-tenant):
const { data: bookings } = await supabase
  .from('bookings')
  .select('*')
  .eq('tenant_id', req.tenant.id);
```

---

## 2. Base de Datos y Aislamiento

### 2.1 Schema Multi-Tenant

```sql
-- Tabla de Tenants (organizaciones/clientes)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(50) UNIQUE NOT NULL,
  custom_domain VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, trial, cancelled
  plan_id UUID REFERENCES plans(id),
  max_users INTEGER DEFAULT 5,
  max_trucks INTEGER DEFAULT 10,
  sap_license_slots INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  trial_ends_at TIMESTAMP,
  subscription_ends_at TIMESTAMP
);

-- Agregar tenant_id a todas las tablas existentes
ALTER TABLE trucks ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE bookings ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Tabla de usuarios multi-tenant
CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES auth.users(id),
  role VARCHAR(50), -- admin, agendador, chofer
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- Configurations por tenant
CREATE TABLE tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  key VARCHAR(100),
  value JSONB,
  UNIQUE(tenant_id, key)
);

-- Ejemplos de settings:
-- timezone, working_hours, sap_connection_pool_size
-- notification_preferences, custom_branding
```

### 2.2 Row Level Security (RLS)

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
CREATE POLICY "Usuarios solo ven datos de su tenant"
  ON bookings
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id 
      FROM tenant_users 
      WHERE user_id = auth.uid()
    )
  );

-- Admin puede ver/editar todo su tenant
CREATE POLICY "Admin gestiona su tenant"
  ON bookings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE tenant_users.user_id = auth.uid()
        AND tenant_users.tenant_id = bookings.tenant_id
        AND tenant_users.role = 'admin'
    )
  );
```

### 2.3 Migración de Datos

```typescript
// Script para migrar datos existentes a tenant inicial
async function migrateToMultiTenant() {
  // 1. Crear tenant inicial para datos existentes
  const { data: tenant } = await supabase
    .from('tenants')
    .insert({
      name: 'Legacy Tenant',
      subdomain: 'default',
      plan_id: 'legacy_plan',
      status: 'active'
    })
    .select()
    .single();

  // 2. Actualizar todos los registros existentes
  await supabase
    .from('bookings')
    .update({ tenant_id: tenant.id })
    .is('tenant_id', null);

  await supabase
    .from('trucks')
    .update({ tenant_id: tenant.id })
    .is('tenant_id', null);
}
```

---

## 3. Autenticación y Autorización

### 3.1 Arquitectura de Auth

```
┌─────────────────────────────────────────┐
│         Usuario intenta login           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   Subdomain: cliente1.agendaosb1.com    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   Resolver tenant desde subdomain       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   Supabase Auth (email + password)      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   Verificar usuario pertenece a tenant  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   JWT con claims: {tenant_id, role}     │
└─────────────────────────────────────────┘
```

### 3.2 Implementación

```typescript
// server.ts - Middleware de autenticación multi-tenant
async function authenticateTenant(req, res, next) {
  const subdomain = req.subdomains[0];
  const authHeader = req.headers.authorization;
  
  if (!subdomain) {
    return res.status(400).json({
      error: 'Tenant no especificado. Use subdomain: cliente.agendaosb1.com'
    });
  }

  // 1. Verificar tenant existe y está activo
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*, plans.*')
    .eq('subdomain', subdomain)
    .single();

  if (error || !tenant) {
    return res.status(404).json({ error: 'Tenant no encontrado' });
  }

  if (tenant.status === 'suspended') {
    return res.status(403).json({ error: 'Cuenta suspendida' });
  }

  if (tenant.status === 'trial' && tenant.trial_ends_at < new Date()) {
    return res.status(402).json({ 
      error: 'Período de prueba expirado. Actualice su plan.' 
    });
  }

  req.tenant = tenant;

  // 2. Verificar token JWT
  const token = authHeader?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const { data: { user }, error: authError } = 
    await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // 3. Verificar usuario pertenece a tenant
  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) {
    return res.status(403).json({ 
      error: 'Usuario no pertenece a este tenant' 
    });
  }

  req.user = user;
  req.tenantUser = tenantUser;
  
  next();
}
```

### 3.3 Registro de Nuevos Tenants

```typescript
// Endpoint para crear nuevo tenant (self-service)
app.post('/api/tenants/register', async (req, res) => {
  const { 
    companyName, 
    subdomain, 
    adminEmail, 
    adminPassword,
    planId 
  } = req.body;

  // Validar subdomain disponible
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('subdomain', subdomain)
    .single();

  if (existing) {
    return res.status(409).json({ 
      error: 'Subdomain no disponible' 
    });
  }

  // Crear tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: companyName,
      subdomain,
      plan_id: planId || 'free',
      status: 'trial',
      trial_ends_at: addDays(new Date(), 14), // 14 días trial
    })
    .select()
    .single();

  if (tenantError) {
    return res.status(500).json({ error: tenantError.message });
  }

  // Crear usuario admin en Supabase Auth
  const { data: adminUser, error: authError } = 
    await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { tenant_id: tenant.id }
    });

  if (authError) {
    // Rollback tenant
    await supabase.from('tenants').delete().eq('id', tenant.id);
    return res.status(500).json({ error: authError.message });
  }

  // Vincular usuario admin al tenant
  await supabase.from('tenant_users').insert({
    tenant_id: tenant.id,
    user_id: adminUser.user.id,
    role: 'admin'
  });

  // Enviar email de bienvenida
  await sendWelcomeEmail({
    to: adminEmail,
    companyName,
    subdomain,
    loginUrl: `https://${subdomain}.agendaosb1.com`
  });

  res.status(201).json({
    success: true,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      trialEndsAt: tenant.trial_ends_at
    }
  });
});
```

---

## 4. Infraestructura y Deploy

### 4.1 Stack Tecnológico Recomendado

```yaml
Frontend:
  - React + Vite (ya implementado)
  - CDN: CloudFlare / Vercel Edge Network

Backend:
  - Node.js + Express (ya implementado)
  - Deploy: Railway, Render, o AWS ECS
  - Load Balancer: Nginx / AWS ALB

Base de Datos:
  - Supabase (PostgreSQL) - ya implementado
  - Connection Pooling: Supavisor (incluido)

Caché:
  - Redis (Upstash o Redis Cloud)
  - Para: sesiones, rate limiting, datos frecuentes

File Storage:
  - Supabase Storage (documentos, logos)
  - AWS S3 (backups, logs)

Monitoring:
  - Sentry (errores frontend/backend)
  - Logtail / Datadog (logs)
  - UptimeRobot (monitoreo uptime)

Email:
  - Resend / SendGrid / AWS SES

Billing:
  - Stripe (suscripciones, pagos)

DNS/CDN:
  - CloudFlare (wildcard SSL, subdomain routing)
```

### 4.2 Configuración de Wildcard Subdomains

```nginx
# Nginx config para wildcard subdomains
server {
  listen 80;
  server_name *.agendaosb1.com;

  # Resolver tenant desde subdomain
  location / {
    proxy_set_header X-Tenant-Subdomain $1;
    proxy_pass http://backend:3000;
  }
}
```

```typescript
// Express - Extraer subdomain
app.use((req, res, next) => {
  const host = req.headers.host;
  const match = host?.match(/^([a-z0-9-]+)\.agendaosb1\.com$/);
  
  if (match) {
    req.subdomains = [match[1]];
  }
  
  next();
});
```

### 4.3 Docker Compose para Desarrollo

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### 4.4 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm test
      
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Railway/Render
        run: |
          # Deploy commands
          echo "Deploying..."
```

---

## 5. Monetización y Planes

### 5.1 Estructura de Planes

```typescript
interface Plan {
  id: string;
  name: string;
  price: number; // USD/mes
  yearlyPrice: number; // USD/año (con descuento)
  features: {
    maxUsers: number;
    maxTrucks: number;
    maxBookingsPerMonth: number;
    sapIntegrations: number; // Cuántas conexiones SAP B1
    realtimeSync: boolean;
    apiAccess: boolean;
    customBranding: boolean;
    prioritySupport: boolean;
    sla: string | null; // "99.9%", "99.99%"
    dataRetention: string; // "30 días", "1 año", "ilimitado"
  };
}

// Planes recomendados para AGENDAO SB1
const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Gratuito',
    price: 0,
    yearlyPrice: 0,
    features: {
      maxUsers: 2,
      maxTrucks: 3,
      maxBookingsPerMonth: 50,
      sapIntegrations: 0, // Sin SAP en plan free
      realtimeSync: true,
      apiAccess: false,
      customBranding: false,
      prioritySupport: false,
      sla: null,
      dataRetention: '30 días'
    }
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    yearlyPrice: 470, // ~2 meses gratis
    features: {
      maxUsers: 5,
      maxTrucks: 10,
      maxBookingsPerMonth: 500,
      sapIntegrations: 1,
      realtimeSync: true,
      apiAccess: true,
      customBranding: false,
      prioritySupport: false,
      sla: '99.5%',
      dataRetention: '1 año'
    }
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 149,
    yearlyPrice: 1430,
    features: {
      maxUsers: 20,
      maxTrucks: 50,
      maxBookingsPerMonth: 'ilimitado',
      sapIntegrations: 3,
      realtimeSync: true,
      apiAccess: true,
      customBranding: true,
      prioritySupport: true,
      sla: '99.9%',
      dataRetention: '3 años'
    }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'custom', // Pricing personalizado
    yearlyPrice: 'custom',
    features: {
      maxUsers: 'ilimitado',
      maxTrucks: 'ilimitado',
      maxBookingsPerMonth: 'ilimitado',
      sapIntegrations: 'ilimitado',
      realtimeSync: true,
      apiAccess: true,
      customBranding: true,
      prioritySupport: true,
      sla: '99.99%',
      dataRetention: 'ilimitado'
    }
  }
];
```

### 5.2 Tabla de Plans en BD

```sql
CREATE TABLE plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  price_monthly DECIMAL(10, 2),
  price_yearly DECIMAL(10, 2),
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_yearly VARCHAR(255),
  features JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insertar planes iniciales
INSERT INTO plans (id, name, price_monthly, price_yearly, features) VALUES
('free', 'Gratuito', 0, 0, '{
  "maxUsers": 2,
  "maxTrucks": 3,
  "maxBookingsPerMonth": 50,
  "sapIntegrations": 0,
  "realtimeSync": true,
  "apiAccess": false,
  "customBranding": false,
  "prioritySupport": false,
  "sla": null,
  "dataRetention": "30 días"
}'),
('starter', 'Starter', 49.00, 470.00, '{
  "maxUsers": 5,
  "maxTrucks": 10,
  "maxBookingsPerMonth": 500,
  "sapIntegrations": 1,
  "realtimeSync": true,
  "apiAccess": true,
  "customBranding": false,
  "prioritySupport": false,
  "sla": "99.5%",
  "dataRetention": "1 año"
}'),
('professional', 'Professional', 149.00, 1430.00, '{
  "maxUsers": 20,
  "maxTrucks": 50,
  "maxBookingsPerMonth": -1,
  "sapIntegrations": 3,
  "realtimeSync": true,
  "apiAccess": true,
  "customBranding": true,
  "prioritySupport": true,
  "sla": "99.9%",
  "dataRetention": "3 años"
}'),
('enterprise', 'Enterprise', NULL, NULL, '{
  "maxUsers": -1,
  "maxTrucks": -1,
  "maxBookingsPerMonth": -1,
  "sapIntegrations": -1,
  "realtimeSync": true,
  "apiAccess": true,
  "customBranding": true,
  "prioritySupport": true,
  "sla": "99.99%",
  "dataRetention": "ilimitado"
}');
```

---

## 6. Billing y Suscripciones

### 6.1 Stripe Integration

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Crear Checkout Session para suscripción
app.post('/api/billing/create-checkout-session', 
  authenticateTenant, 
  async (req, res) => {
    const { planId, billingCycle } = req.body; // 'monthly' | 'yearly'
    
    const plan = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (!plan || !plan.stripe_price_id_${billingCycle}) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: req.user.email,
      metadata: {
        tenant_id: req.tenant.id,
        plan_id: planId,
        billing_cycle: billingCycle
      },
      line_items: [{
        price: plan.stripe_price_id_${billingCycle},
        quantity: 1,
      }],
      success_url: `https://${req.tenant.subdomain}.agendaosb1.com/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://${req.tenant.subdomain}.agendaosb1.com/billing/cancel`,
    });

    res.json({ url: session.url });
  }
);

// Webhook para eventos de Stripe
app.post('/api/billing/webhook', 
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Manejar eventos
    switch (event.type) {
      case 'checkout.session.completed':
        await handleSubscriptionCreated(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
    }

    res.json({ received: true });
  }
);

// Handlers de eventos
async function handleSubscriptionCreated(session: Stripe.Checkout.Session) {
  const { tenant_id, plan_id, billing_cycle } = session.metadata;
  
  await supabase.from('tenants').update({
    plan_id,
    billing_cycle,
    subscription_ends_at: new Date(
      session.subscription.end_date * 1000
    ),
    status: 'active'
  }).eq('id', tenant_id);

  // Crear registro de suscripción
  await supabase.from('subscriptions').insert({
    tenant_id,
    stripe_subscription_id: session.subscription,
    plan_id,
    billing_cycle,
    status: 'active',
    current_period_start: new Date(),
    current_period_end: new Date(session.subscription.end_date * 1000)
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const tenantId = invoice.metadata.tenant_id;
  
  // Notificar al tenant
  await sendEmail({
    to: invoice.customer_email,
    subject: 'Pago fallido - AGENDAO SB1',
    template: 'payment_failed',
    data: { 
      amount: invoice.amount_due / 100,
      updateUrl: `https://${tenantId}.agendaosb1.com/billing/update-payment`
    }
  });
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription) {
  const tenantId = subscription.metadata.tenant_id;
  
  // Downgradear a plan gratuito
  await supabase.from('tenants').update({
    plan_id: 'free',
    status: 'cancelled',
    subscription_ends_at: new Date()
  }).eq('id', tenantId);

  // Notificar
  await sendEmail({
    to: tenant.admin_email,
    subject: 'Suscripción cancelada',
    template: 'subscription_cancelled'
  });
}
```

### 6.2 Gestión de Límites

```typescript
// Middleware para verificar límites del plan
async function enforcePlanLimits(req, res, next) {
  const tenant = req.tenant;
  const plan = await supabase
    .from('plans')
    .select('*')
    .eq('id', tenant.plan_id)
    .single();

  // Verificar límite de usuarios
  if (req.path.includes('/users') && req.method === 'POST') {
    const { count } = await supabase
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id);

    if (count >= plan.features.maxUsers) {
      return res.status(402).json({
        error: 'Límite de usuarios alcanzado',
        upgrade_url: `https://${tenant.subdomain}.agendaosb1.com/billing/upgrade`
      });
    }
  }

  // Verificar límite de camiones
  if (req.path.includes('/trucks') && req.method === 'POST') {
    const { count } = await supabase
      .from('trucks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id);

    if (count >= plan.features.maxTrucks) {
      return res.status(402).json({
        error: 'Límite de camiones alcanzado',
        upgrade_url: `https://${tenant.subdomain}.agendaosb1.com/billing/upgrade`
      });
    }
  }

  // Verificar bookings del mes
  if (req.path.includes('/bookings') && req.method === 'POST') {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', startOfMonth.toISOString());

    if (plan.features.maxBookingsPerMonth > 0 && 
        count >= plan.features.maxBookingsPerMonth) {
      return res.status(402).json({
        error: 'Límite mensual de agendas alcanzado',
        upgrade_url: `https://${tenant.subdomain}.agendaosb1.com/billing/upgrade`
      });
    }
  }

  next();
}
```

---

## 7. Gestión de Tenant

### 7.1 Dashboard de Administración (Super Admin)

```typescript
// Vista interna para gestionar todos los tenants
interface AdminDashboard {
  metrics: {
    totalTenants: number;
    activeTenants: number;
    trialTenants: number;
    totalMRR: number; // Monthly Recurring Revenue
    totalARR: number; // Annual Recurring Revenue
    churnRate: number;
  };
  tenants: Array<{
    id: string;
    name: string;
    subdomain: string;
    plan: string;
    status: string;
    users: number;
    trucks: number;
    bookingsThisMonth: number;
    mrr: number;
    createdAt: Date;
    lastActiveAt: Date;
  }>;
}

// Endpoint admin (protegido con role 'super_admin')
app.get('/api/admin/tenants', authenticateSuperAdmin, async (req, res) => {
  const tenants = await supabase
    .from('tenants')
    .select(`
      *,
      plans (name, price_monthly),
      tenant_users (count),
      trucks (count),
      bookings (count)
    `);

  res.json({ tenants });
});

// Suspender tenant
app.post('/api/admin/tenants/:id/suspend', authenticateSuperAdmin, 
  async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    await supabase.from('tenants').update({
      status: 'suspended',
      suspension_reason: reason
    }).eq('id', id);

    // Notificar al tenant
    const tenant = await supabase.from('tenants').select('*').eq('id', id).single();
    await sendEmail({
      to: tenant.admin_email,
      subject: 'Cuenta suspendida',
      template: 'account_suspended',
      data: { reason }
    });

    res.json({ success: true });
  }
);
```

### 7.2 Tenant Settings

```typescript
// Cada tenant puede personalizar su instancia
interface TenantSettings {
  branding: {
    logoUrl: string;
    primaryColor: string;
    companyName: string;
    faviconUrl: string;
  };
  localization: {
    timezone: string; // "America/Mexico_City"
    locale: string; // "es"
    dateFormat: string; // "DD/MM/YYYY"
    timeFormat: string; // "24h" | "12h"
  };
  notifications: {
    emailOnBooking: boolean;
    emailOnConflict: boolean;
    dailySummary: boolean;
    slackWebhook: string | null;
  };
  sap: {
    serviceLayerUrl: string;
    companyDB: string;
    autoSyncOrders: boolean;
    syncFrequency: '5min' | '15min' | '1hour' | 'manual';
  };
  business: {
    workingHours: {
      start: string; // "06:00"
      end: string; // "22:00"
    };
    workingDays: number[]; // [1,2,3,4,5] (Lun-Vie)
    maxBookingDuration: number; // minutos
    allowOverlap: boolean; // permitir solapamiento
  };
}

// CRUD de settings
app.put('/api/tenant/settings', authenticateTenant, async (req, res) => {
  const settings = req.body;
  
  // Upsert settings
  for (const [key, value] of Object.entries(settings)) {
    await supabase
      .from('tenant_settings')
      .upsert({
        tenant_id: req.tenant.id,
        key,
        value: value as any
      });
  }

  res.json({ success: true });
});
```

---

## 8. Métricas y Analytics

### 8.1 Event Tracking

```typescript
// Tabla de analytics events
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID,
  event_type VARCHAR(100),
  event_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

// Track eventos importantes
async function trackEvent(tenantId: string, userId: string, eventType: string, eventData: any) {
  await supabase.from('analytics_events').insert({
    tenant_id: tenantId,
    user_id: userId,
    event_type: eventType,
    event_data: eventData
  });
}

// Eventos a trackear:
// - booking_created
// - booking_conflict
// - sap_sync_completed
// - user_login
// - plan_upgraded
// - feature_used (cualquier feature importante)
```

### 8.2 Métricas Clave para SaaS

```typescript
interface SaaSMetrics {
  // Revenue
  MRR: number; // Monthly Recurring Revenue
  ARR: number; // Annual Recurring Revenue
  ARPU: number; // Average Revenue Per User
  
  // Growth
  newTenantsThisMonth: number;
  activatedTenantsThisMonth: number;
  churnedTenantsThisMonth: number;
  growthRate: number;
  
  // Engagement
  DAU: number; // Daily Active Users
  WAU: number; // Weekly Active Users
  MAU: number; // Monthly Active Users
  bookingPerUser: number; // Promedio bookings por usuario
  
  // Health
  churnRate: number; // % que cancelan cada mes
  activationRate: number; // % que completan onboarding
  featureAdoption: {
    sapIntegration: number; // % que usan SAP
    realtimeSync: number;
    calendarView: number;
  };
}

// Endpoint para dashboard admin
app.get('/api/admin/metrics', authenticateSuperAdmin, async (req, res) => {
  const metrics = await calculateSaaSMetrics();
  res.json({ metrics });
});
```

### 8.3 Integración con PostHog (Opcional)

```typescript
// PostHog para analytics de producto
import posthog from 'posthog-js';

posthog.init('<ph_api_key>', {
  api_host: 'https://app.posthog.com'
});

// En login
posthog.identify(user.id, {
  email: user.email,
  tenant_id: tenant.id,
  plan: tenant.plan_id
});

// En crear booking
posthog.capture('booking_created', {
  tenant_id: tenant.id,
  truck_id: booking.truckId,
  date: booking.date,
  module: booking.category
});
```

---

## 9. Seguridad y Cumplimiento

### 9.1 Medidas de Seguridad

```typescript
// Rate Limiting con Redis
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'ratelimit:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por ventana
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `${req.tenant?.id}:${req.ip}`; // Rate limit por tenant
  }
});

app.use(limiter);

// CORS configurado por tenant
app.use(cors({
  origin: (origin, callback) => {
    const allowedDomains = [
      /\.agendaosb1\.com$/,
      ...customDomains // tenants con dominio propio
    ];
    
    const isAllowed = allowedDomains.some(pattern => 
      pattern.test(origin)
    );
    
    callback(null, isAllowed);
  },
  credentials: true
}));

// Helmet para headers de seguridad
import helmet from 'helmet';
app.use(helmet());

// Encrypt sensitive data
import { createCipheriv, createDecipheriv } from 'crypto';

async function encryptSapCredentials(data: string): Promise<string> {
  const key = process.env.ENCRYPTION_KEY!;
  const iv = crypto.randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return `${iv.toString('hex')}:${encrypted}`;
}
```

### 9.2 Auditoría y Logs

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID,
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index para queries rápidos
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
```

```typescript
// Middleware de auditoría
async function auditLog(req, res, next) {
  const originalSend = res.json;
  
  res.json = function(data) {
    if (req.method !== 'GET') {
      supabase.from('audit_logs').insert({
        tenant_id: req.tenant.id,
        user_id: req.user?.id,
        action: req.method,
        resource_type: getResourceType(req.path),
        resource_id: getResourceId(req.path),
        old_value: req.method === 'PUT' ? req.body : null,
        new_value: data,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
}
```

### 9.3 Cumplimiento GDPR/LGPD

```typescript
// Data export para tenant
app.post('/api/tenant/export-data', authenticateTenant, async (req, res) => {
  const tenantId = req.tenant.id;
  
  // Exportar todos los datos del tenant
  const exportData = {
    tenant: await supabase.from('tenants').select('*').eq('id', tenantId).single(),
    users: await supabase.from('tenant_users').select('*').eq('tenant_id', tenantId),
    trucks: await supabase.from('trucks').select('*').eq('tenant_id', tenantId),
    bookings: await supabase.from('bookings').select('*').eq('tenant_id', tenantId),
    settings: await supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId),
  };

  // Generar archivo JSON
  const jsonString = JSON.stringify(exportData, null, 2);
  
  res.json({ 
    download_url: `/api/tenant/export/${tenantId}/${Date.now()}.json`,
    expires_at: addHours(new Date(), 24)
  });
});

// Data deletion (derecho al olvido)
app.delete('/api/tenant/account', authenticateTenant, async (req, res) => {
  const tenantId = req.tenant.id;
  
  // Soft delete primero
  await supabase.from('tenants').update({
    status: 'pending_deletion',
    deletion_requested_at: new Date()
  }).eq('id', tenantId);

  // Job asíncrono para eliminar datos después de 30 días
  await scheduleDeletionJob(tenantId, addDays(new Date(), 30));

  res.json({ 
    message: 'Cuenta programada para eliminación en 30 días',
    can_cancel_until: addDays(new Date(), 30)
  });
});
```

---

## 10. API y Integraciones

### 10.1 API REST Pública

```typescript
// API versionada para integraciones de terceros
const API_VERSION = 'v1';

app.use(`/api/${API_VERSION}`, authenticateApi);

// Documentar con Swagger
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json';

app.use(`/api/${API_VERSION}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Endpoints de API
app.get(`/api/${API_VERSION}/trucks`, async (req, res) => {
  const trucks = await supabase
    .from('trucks')
    .select('*')
    .eq('tenant_id', req.tenant.id);
  
  res.json({ data: trucks });
});

app.post(`/api/${API_VERSION}/bookings`, async (req, res) => {
  const booking = await createBooking(req.tenant.id, req.body);
  res.status(201).json({ data: booking });
});
```

### 10.2 Webhooks para Integraciones

```sql
CREATE TABLE webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  url VARCHAR(500),
  events TEXT[], -- ['booking.created', 'booking.updated']
  secret VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

```typescript
// Enviar webhooks cuando ocurren eventos
async function sendWebhook(eventType: string, tenantId: string, payload: any) {
  const { data: endpoints } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  for (const endpoint of endpoints || []) {
    if (endpoint.events.includes(eventType)) {
      const signature = createHmac('sha256', endpoint.secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      try {
        await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature
          },
          body: JSON.stringify({
            event: eventType,
            timestamp: new Date().toISOString(),
            data: payload
          })
        });
      } catch (error) {
        console.error(`Webhook failed for ${endpoint.url}:`, error);
      }
    }
  }
}
```

### 10.3 Integraciones Pre-construidas

```typescript
// SAP Business One (ya implementado)
// Slack notifications
async function sendSlackNotification(webhookUrl: string, message: string) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: message,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: message } }]
    })
  });
}

// WhatsApp (via Twilio)
import twilio from 'twilio';

async function sendWhatsApp(phone: string, message: string) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  
  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_PHONE}`,
    to: `whatsapp:${phone}`,
    body: message
  });
}

// Google Calendar sync
import { google } from 'googleapis';

async function syncToGoogleCalendar(booking: Booking, tenantSettings: any) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({
    access_token: tenantSettings.google_access_token
  });

  const calendar = google.calendar({ version: 'v3', auth });
  
  await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `Agenda: ${booking.truckId}`,
      description: `Booking ${booking.id}`,
      start: { dateTime: `${booking.date}T${booking.startTime}` },
      end: { dateTime: `${booking.date}T${booking.endTime}` }
    }
  });
}
```

---

## 11. Onboarding y UX

### 11.1 Wizard de Onboarding

```typescript
// Pasos del onboarding para nuevos tenants
const ONBOARDING_STEPS = [
  {
    id: 'company_info',
    title: 'Información de Empresa',
    fields: ['companyName', 'industry', 'size']
  },
  {
    id: 'sap_connection',
    title: 'Conectar SAP B1',
    fields: ['serviceLayerUrl', 'companyDB', 'userName', 'password'],
    optional: true
  },
  {
    id: 'add_trucks',
    title: 'Agregar Camiones',
    minItems: 1,
    maxItems: 10
  },
  {
    id: 'invite_users',
    title: 'Invitar Usuarios',
    description: 'Agrega a tu equipo de trabajo',
    minItems: 0
  },
  {
    id: 'create_first_booking',
    title: 'Crear Primera Agenda',
    description: 'Prueba crear una agenda de camión'
  }
];

// Track progreso de onboarding
interface OnboardingProgress {
  tenantId: string;
  currentStep: number;
  completedSteps: string[];
  startedAt: Date;
  completedAt: Date | null;
}

// Endpoint para actualizar progreso
app.post('/api/onboarding/progress', authenticateTenant, async (req, res) => {
  const { stepId, completed } = req.body;
  
  let progress = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('tenant_id', req.tenant.id)
    .single();

  if (!progress) {
    // Crear progreso inicial
    const { data } = await supabase
      .from('onboarding_progress')
      .insert({
        tenant_id: req.tenant.id,
        current_step: 0,
        completed_steps: []
      })
      .select()
      .single();
    
    progress = data;
  }

  if (completed && !progress.completed_steps.includes(stepId)) {
    progress.completed_steps.push(stepId);
    progress.current_step = ONBOARDING_STEPS.findIndex(
      s => s.id === stepId
    ) + 1;

    // Verificar si completó todo
    if (progress.completed_steps.length === ONBOARDING_STEPS.length) {
      progress.completed_at = new Date();
      
      // Enviar email de felicitación
      await sendEmail({
        to: req.user.email,
        subject: '¡Onboarding completado! 🎉',
        template: 'onboarding_complete'
      });
    }
  }

  await supabase
    .from('onboarding_progress')
    .update(progress)
    .eq('tenant_id', req.tenant.id);

  res.json({ progress });
});
```

### 11.2 Templates de Email

```typescript
// Usar Resend para emails transaccionales
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

const EMAIL_TEMPLATES = {
  welcome: {
    subject: 'Bienvenido a AGENDAO SB1',
    template: `
      <h1>¡Bienvenido a AGENDAO SB1!</h1>
      <p>Hola {{name}},</p>
      <p>Tu cuenta está lista. Accede aquí:</p>
      <a href="https://{{subdomain}}.agendaosb1.com">
        https://{{subdomain}}.agendaosb1.com
      </a>
      <p>Período de prueba: 14 días</p>
    `
  },
  trial_expiring: {
    subject: 'Tu prueba de AGENDAO SB1 está por expirar',
    template: `
      <h2>Tu período de prueba termina en {{days}} días</h2>
      <p>Para seguir usando AGENDAO SB1, actualiza tu plan:</p>
      <a href="https://{{subdomain}}.agendaosb1.com/billing/upgrade">
        Ver Planes
      </a>
    `
  },
  booking_conflict: {
    subject: 'Conflicto de Agenda Detectado',
    template: `
      <p>Se detectó un conflicto de agenda:</p>
      <p><strong>Camión:</strong> {{truckName}}</p>
      <p><strong>Fecha:</strong> {{date}}</p>
      <p><strong>Horario:</strong> {{startTime}} - {{endTime}}</p>
    `
  }
};

async function sendEmail({
  to,
  subject,
  template,
  data
}: {
  to: string;
  subject: string;
  template: string;
  data: Record<string, string>;
}) {
  let html = EMAIL_TEMPLATES[template]?.template || '';
  
  // Reemplazar variables
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  await resend.emails.send({
    from: 'AGENDAO SB1 <noreply@agendaosb1.com>',
    to,
    subject,
    html
  });
}
```

### 11.3 Custom Branding (Plan Professional+)

```typescript
// Permitir que tenants personalicen su interfaz
interface CustomBranding {
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string; // "#3B82F6"
  companyName: string;
  customCSS: string; // CSS adicional (sanitizado)
}

// Middleware para inyectar branding
app.get('/app-config', authenticateTenant, async (req, res) => {
  const branding = await supabase
    .from('tenant_settings')
    .select('value')
    .eq('tenant_id', req.tenant.id)
    .eq('key', 'branding')
    .single();

  res.json({
    branding: branding?.value || null,
    features: req.tenant.plan.features
  });
});

// En el frontend (React)
function useTenantBranding() {
  const { data: config } = useQuery('/app-config');
  
  useEffect(() => {
    if (config?.branding) {
      document.documentElement.style.setProperty(
        '--color-primary',
        config.branding.primaryColor
      );
      document.title = config.branding.companyName;
      
      // Actualizar favicon
      const link = document.querySelector("link[rel='icon']");
      if (link) {
        link.href = config.branding.faviconUrl;
      }
    }
  }, [config]);
  
  return config?.branding;
}
```

---

## 12. Backup y Recuperación

### 12.1 Estrategia de Backups

```typescript
// Backup automatizado diario
// Usar pg_dump de PostgreSQL o Supabase backups

async function createTenantBackup(tenantId: string) {
  // Exportar datos del tenant
  const backup = {
    tenant: await supabase.from('tenants').select('*').eq('id', tenantId).single(),
    users: await supabase.from('tenant_users').select('*').eq('tenant_id', tenantId),
    trucks: await supabase.from('trucks').select('*').eq('tenant_id', tenantId),
    bookings: await supabase.from('bookings').select('*').eq('tenant_id', tenantId),
    settings: await supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId),
    audit_logs: await supabase.from('audit_logs').select('*').eq('tenant_id', tenantId),
    exported_at: new Date().toISOString()
  };

  // Guardar en S3
  const key = `backups/${tenantId}/${Date.now()}.json`;
  await s3.putObject({
    Bucket: process.env.AWS_S3_BACKUP_BUCKET,
    Key: key,
    Body: JSON.stringify(backup, null, 2)
  });

  return key;
}

// Job diario para backups
import cron from 'node-cron';

cron.schedule('0 2 * * *', async () => {
  // Backup a las 2 AM todos los días
  console.log('Starting daily backups...');
  
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id')
    .eq('status', 'active');

  for (const tenant of tenants || []) {
    try {
      await createTenantBackup(tenant.id);
      console.log(`Backup completed for tenant ${tenant.id}`);
    } catch (error) {
      console.error(`Backup failed for tenant ${tenant.id}:`, error);
    }
  }
});
```

### 12.2 Disaster Recovery

```typescript
// Restaurar backup de tenant
app.post('/api/admin/tenants/:id/restore', authenticateSuperAdmin, async (req, res) => {
  const { backupKey } = req.body;
  const tenantId = req.params.id;

  // Descargar backup desde S3
  const { Body } = await s3.getObject({
    Bucket: process.env.AWS_S3_BACKUP_BUCKET,
    Key: backupKey
  });

  const backup = JSON.parse(Body.toString());

  // Verificar backup pertenece al tenant
  if (backup.tenant.id !== tenantId) {
    return res.status(400).json({ error: 'Backup no corresponde al tenant' });
  }

  // Restaurar datos (con transacción)
  const { error } = await supabase.rpc('restore_tenant_from_backup', {
    p_tenant_id: tenantId,
    p_backup_data: backup
  });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, message: 'Tenant restaurado exitosamente' });
});
```

---

## 13. Testing y QA

### 13.1 Test Strategy

```typescript
// Tests multi-tenant
describe('Multi-tenant isolation', () => {
  it('Tenant A no puede ver datos de Tenant B', async () => {
    const tenantA = await createTestTenant('tenant-a');
    const tenantB = await createTestTenant('tenant-b');

    const bookingA = await createBooking(tenantA.id, {
      truckId: 'truck-1',
      date: '2026-04-15',
      startTime: '08:00',
      endTime: '09:00'
    });

    // Tenant B intenta ver bookings
    const response = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${tenantB.token}`);

    expect(response.body.data).not.toContain(bookingA);
  });

  it('Conflicto de agenda solo dentro del mismo tenant', async () => {
    const tenantA = await createTestTenant('tenant-a');

    const booking1 = await createBooking(tenantA.id, {
      truckId: 'truck-1',
      date: '2026-04-15',
      startTime: '08:00',
      endTime: '09:00'
    });

    // Mismo truck, misma hora, mismo tenant → conflicto
    const conflictResponse = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .send({
        truckId: 'truck-1',
        date: '2026-04-15',
        startTime: '08:30',
        endTime: '09:30'
      });

    expect(conflictResponse.status).toBe(409);
  });
});

// Tests de carga
describe('Load testing', () => {
  it('Soporta 1000 requests simultáneos', async () => {
    const promises = Array(1000).fill(null).map(() => 
      request(app).get('/api/bookings')
    );

    const responses = await Promise.all(promises);
    
    expect(responses.every(r => r.status === 200)).toBe(true);
  });
});
```

### 13.2 Testing de Integración SAP

```typescript
// Mock SAP Service Layer para tests
import nock from 'nock';

describe('SAP Integration', () => {
  beforeEach(() => {
    // Mock SAP endpoints
    nock('https://sap-test.company.com:50000')
      .post('/b1s/v1/Login')
      .reply(200, {
        SessionId: 'mock-session-id',
        SessionTimeout: 30
      });
  });

  it('Conecta correctamente con SAP B1', async () => {
    const response = await request(app)
      .post('/api/sap/login')
      .send({
        serviceLayerUrl: 'https://sap-test.company.com:50000/b1s/v1',
        companyDB: 'TEST_DB',
        userName: 'manager',
        password: 'password'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

---

## 14. Roadmap de Implementación

### Fase 1: Preparación (Semanas 1-2)

- [ ] **1.1.** Diseñar schema multi-tenant en Supabase
- [ ] **1.2.** Crear migraciones de BD para agregar `tenant_id`
- [ ] **1.3.** Implementar RLS policies en todas las tablas
- [ ] **1.4.** Crear tabla `tenants` y `tenant_users`
- [ ] **1.5.** Actualizar queries existentes para filtrar por `tenant_id`
- [ ] **1.6.** Agregar middleware de resolución de tenant

**Entregable:** Base de datos lista para multi-tenancy

---

### Fase 2: Auth y Subdomains (Semanas 3-4)

- [ ] **2.1.** Configurar wildcard DNS (*.agendaosb1.com)
- [ ] **2.2.** Implementar subdomain routing en Express
- [ ] **2.3.** Configurar SSL wildcard con CloudFlare
- [ ] **2.4.** Crear flujo de registro de nuevos tenants
- [ ] **2.5.** Implementar onboarding wizard
- [ ] **2.6.** Testing de aislamiento entre tenants

**Entregable:** Registro self-service funcionando

---

### Fase 3: Billing y Plans (Semanas 5-6)

- [ ] **3.1.** Crear cuenta de Stripe y productos
- [ ] **3.2.** Implementar checkout flow con Stripe
- [ ] **3.3.** Configurar webhooks de Stripe
- [ ] **3.4.** Crear middleware de enforcement de límites
- [ ] **3.5.** Implementar upgrade/downgrade de planes
- [ ] **3.6.** Dashboard de billing para tenants
- [ ] **3.7.** Email de trial expiring

**Entregable:** Sistema de facturación completo

---

### Fase 4: Admin Dashboard y Métricas (Semanas 7-8)

- [ ] **4.1.** Crear dashboard de super-admin
- [ ] **4.2.** Implementar métricas SaaS (MRR, ARR, churn)
- [ ] **4.3.** Integrar PostHog para analytics
- [ ] **4.4.** Configurar Sentry para monitoreo de errores
- [ ] **4.5.** Audit logs para todas las acciones críticas
- [ ] **4.6.** Endpoint de exportación de datos

**Entregable:** Visibilidad completa del negocio

---

### Fase 5: Infraestructura y Deploy (Semanas 9-10)

- [ ] **5.1.** Configurar Redis para caching y rate limiting
- [ ] **5.2.** Implementar Docker compose
- [ ] **5.3.** Configurar CI/CD con GitHub Actions
- [ ] **5.4.** Deploy a producción (Railway/Render/AWS)
- [ ] **5.5.** Configurar backups automáticos
- [ ] **5.6.** Setup de monitoreo y alertas
- [ ] **5.7.** Load testing y optimización

**Entregable:** Producción listo para escalar

---

### Fase 6: Integraciones y API (Semanas 11-12)

- [ ] **6.1.** Documentar API pública con Swagger
- [ ] **6.2.** Implementar sistema de API keys
- [ ] **6.3.** Crear webhooks para integraciones
- [ ] **6.4.** Integración con Slack
- [ ] **6.5.** Integración con WhatsApp (Twilio)
- [ ] **6.6.** Google Calendar sync
- [ ] **6.7.** Testing de integraciones

**Entregable:** Plataforma extensible

---

### Fase 7: Custom Branding y Polish (Semanas 13-14)

- [ ] **7.1.** Implementar custom branding para tenants
- [ ] **7.2.** Sistema de notificaciones por email
- [ ] **7.3.** Templates de email profesionales
- [ ] **7.4.** Custom domain support (CNAME)
- [ ] **7.5.** Página de pricing y marketing
- [ ] **7.6.** Documentación pública
- [ ] **7.7.** Centro de ayuda / FAQ

**Entregable:** Producto white-label listo

---

### Fase 8: Lanzamiento (Semanas 15-16)

- [ ] **8.1.** Beta cerrada con 3-5 tenants iniciales
- [ ] **8.2.** Recopilar feedback y iterar
- [ ] **8.3.** Beta abierta (public beta)
- [ ] **8.4.** Marketing y launch en Product Hunt
- [ ] **8.5.** Programa de referidos
- [ ] **8.6.** Soporte prioritario para early adopters
- [ ] **8.7.** Monitoring intensivo post-launch

**Entregable:** 🚀 SaaS en producción

---

## 📊 Métricas de Éxito

| Métrica | Objetivo Mes 1 | Objetivo Mes 3 | Objetivo Mes 6 |
|---------|---------------|---------------|---------------|
| Tenants Activos | 5 | 20 | 50 |
| MRR | $250 | $3,000 | $10,000 |
| Churn Rate | <10% | <7% | <5% |
| Activation Rate | >60% | >70% | >80% |
| NPS | >40 | >50 | >60 |

---

## 💰 Proyección de Costos Infraestructura

| Servicio | Plan Gratuito | 50 Tenants | 200 Tenants |
|----------|--------------|------------|-------------|
| Supabase (Pro) | $25/mes | $25/mes | $50/mes |
| Hosting (Railway) | $5/mes | $20/mes | $50/mes |
| Redis (Upstash) | Gratis | $20/mes | $40/mes |
| Email (Resend) | Gratis (3K emails) | $20/mes | $50/mes |
| Stripe | 2.9% + $0.30 | ~$150/mes | ~$600/mes |
| Sentry | Gratis | $26/mes | $26/mes |
| CloudFlare | Gratis | Gratis | Gratis |
| **Total** | **~$55/mes** | **~$261/mes** | **~$816/mes** |

**Margen de ganancia objetivo:** 70-80%

---

## 🎯 Checklist Pre-Lanzamiento

### Técnico
- [ ] Todos los tests pasando (>90% coverage)
- [ ] Load testing completado (1000 usuarios concurrentes)
- [ ] Security audit completado
- [ ] Penetration testing
- [ ] Backup y restore probados
- [ ] Monitoring y alertas configuradas
- [ ] SSL wildcard funcionando
- [ ] Subdomain routing probado
- [ ] RLS policies verificadas
- [ ] Rate limiting activo

### Negocio
- [ ] Términos de servicio redactados
- [ ] Política de privacidad (GDPR compliant)
- [ ] Pricing definido y validado
- [ ] Página de marketing lista
- [ ] Documentación pública completa
- [ ] Soporte al cliente configurado
- [ ] Email de bienvenida automatizado
- [ ] Email de trial expiring configurado
- [ ] Stripe configurado con todos los productos

### Marketing
- [ ] Landing page optimizada para conversión
- [ ] Blog con contenido SEO
- [ ] Cuentas en redes sociales
- [ ] Product Hunt launch preparado
- [ ] Programa de referidos activo
- [ ] Casos de éxito de beta testers

---

## 🔮 Futuras Mejoras (Post-MVP)

- [ ] **Mobile App** (React Native / Flutter)
- [ ] **AI para predicción de demanda** (Gemini API)
- [ ] **Ruta optimización para camiones**
- [ ] **IoT integration** (GPS trackers en camiones)
- [ ] **Marketplace de integraciones**
- [ ] **White-label completo** (dominio 100% custom)
- [ ] **Multi-idioma** (i18n completo)
- [ ] **Advanced Analytics** (dashboards custom)
- [ ] **API GraphQL** (adicional a REST)
- [ ] **Offline mode** (PWA capabilities)

---

## 📚 Recursos Adicionales

### Lecturas Recomendadas
- [SaaS Architecture Guide](https://www.atlassian.com/microservices/microservices-architecture/saas-architecture)
- [Multi-Tenant Data Security](https://aws.amazon.com/blogs/apn/multi-tenant-saas-architecture-patterns/)
- [Stripe Subscription Best Practices](https://stripe.com/docs/billing/subscriptions/best-practices)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

### Herramientas Útiles
- [Stripe Dashboard](https://dashboard.stripe.com)
- [Supabase Dashboard](https://app.supabase.com)
- [Sentry](https://sentry.io)
- [PostHog](https://posthog.com)
- [Resend](https://resend.com)

---

> [!IMPORTANT]
> **Próximos Pasos:** Comenzar con la **Fase 1** - diseñar el schema multi-tenant en Supabase y crear las migraciones necesarias.
> 
> ¿Quieres que te ayude a implementar alguna fase específica?

---

*Documento creado el 14 de abril, 2026*  
*Versión: 1.0*  
*Autor: AGENDAO SB1 Development Team*

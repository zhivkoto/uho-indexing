'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Zap,
  Database,
  Radio,
  Users,
  ArrowRight,
  Upload,
  Cpu,
  Search,
  Github,
  Webhook,
  Bot,
  FileJson,
  Mail,
} from 'lucide-react';

/* ─── Animated Grid Background ─── */
function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle, #63637A 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />
    </div>
  );
}

/* ─── Typing Terminal ─── */
function AnimatedTerminal() {
  const lines = [
    { type: 'cmd', text: '$ npx uho init --idl ./target/idl/my_program.json' },
    { type: 'out', text: '✓ Parsed 8 events from IDL' },
    { type: 'out', text: '✓ Generated PostgreSQL schema (8 tables)' },
    { type: 'out', text: '✓ Created REST + WebSocket endpoints' },
    { type: 'gap' },
    { type: 'cmd', text: '$ npx uho start' },
    { type: 'out', text: '● Indexer live → https://api.uho.dev/v1/my_program' },
    { type: 'gap' },
    { type: 'cmd', text: '$ curl /v1/my_program/events/SwapExecuted?limit=5' },
    { type: 'out', text: '{ "data": [{ "user": "7xK...", "amount": 1500 }] }' },
  ];

  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleLines((v) => {
        if (v >= lines.length) {
          clearInterval(timer);
          return v;
        }
        return v + 1;
      });
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="rounded-2xl border border-uho-border bg-uho-raised overflow-hidden shadow-card group hover:shadow-accent-glow transition-shadow duration-500">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-uho-border bg-uho-elevated/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#F87171]/60" />
          <div className="w-3 h-3 rounded-full bg-[#FBBF24]/60" />
          <div className="w-3 h-3 rounded-full bg-[#34D399]/60" />
        </div>
        <span className="text-xs text-uho-text-tertiary font-mono ml-2">terminal</span>
      </div>
      <div className="p-6 font-mono text-[13px] leading-relaxed space-y-1 min-h-[280px]">
        {lines.slice(0, visibleLines).map((line, i) => {
          if (line.type === 'gap') return <div key={i} className="h-3" />;
          if (line.type === 'cmd') {
            const parts = line.text!.split(' ');
            return (
              <div key={i} className="animate-fade-in">
                <span className="text-uho-text-tertiary">{parts[0]}</span>{' '}
                <span className="text-uho-accent">{parts[1]}</span>{' '}
                <span className="text-uho-text-primary">{parts.slice(2).join(' ')}</span>
              </div>
            );
          }
          const isLive = line.text!.startsWith('●');
          return (
            <div key={i} className="animate-fade-in text-uho-text-tertiary">
              {isLive ? (
                <>
                  <span className="text-[#34D399]">●</span>{' '}
                  <span className="text-uho-text-tertiary">
                    Indexer live →{' '}
                    <span className="text-uho-accent">https://api.uho.dev/v1/my_program</span>
                  </span>
                </>
              ) : (
                line.text
              )}
            </div>
          );
        })}
        {visibleLines < lines.length && (
          <span className="inline-block w-2 h-4 bg-uho-accent animate-pulse" />
        )}
      </div>
    </div>
  );
}

/* ─── Stats Bar ─── */
const stats = [
  { label: 'Events Indexed', value: '14M+' },
  { label: 'Avg Latency', value: '<200ms' },
  { label: 'Programs Supported', value: 'Any IDL' },
  { label: 'Setup Time', value: '~2 min' },
];

function StatsBar() {
  return (
    <section className="py-16 px-6 border-y border-uho-border">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="font-mono text-2xl md:text-3xl font-bold text-uho-accent mb-1">
              {s.value}
            </div>
            <div className="text-xs text-uho-text-tertiary uppercase tracking-widest font-medium">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Nav ─── */
function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-uho-border/50 bg-uho-base/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 relative flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 relative z-10">
          <img src="/logo.svg" alt="Uho" className="w-10 h-10 rounded-lg shadow-accent-glow" />
          <span className="font-semibold text-lg text-uho-text-primary tracking-tight">Uho</span>
        </Link>
        <div className="hidden md:flex items-center justify-center gap-8 text-sm text-uho-text-secondary absolute inset-0">
          <a href="#features" className="hover:text-uho-text-primary transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-uho-text-primary transition-colors">How it works</a>
          <a href="#agents" className="hover:text-uho-text-primary transition-colors">For Agents</a>
        </div>
        <div className="flex items-center gap-3 shrink-0 relative z-10">
          <Link href="/login" className="text-sm text-uho-text-secondary hover:text-uho-text-primary transition-colors px-3 py-1.5">
            Sign in
          </Link>
          <Link href="/register" className="text-sm font-medium bg-uho-accent text-uho-base px-4 py-2 rounded-full hover:bg-uho-accent-light transition-colors shadow-accent-glow">
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ─── Hero ─── */
function Hero() {
  return (
    <section className="pt-36 pb-20 px-6 relative overflow-hidden">
      {/* Glow orbs */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-uho-accent/[0.04] rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-5%] w-[300px] h-[300px] bg-uho-accent/[0.03] rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-uho-accent bg-uho-accent/10 border border-uho-accent/20 rounded-full px-4 py-1.5 mb-8 animate-fade-in">
            <Zap className="w-3.5 h-3.5" />
            Agent-native · IDL-driven · Zero config
          </div>

          <h1 className="text-5xl md:text-[72px] font-bold tracking-tight leading-[1.05] mb-6">
            <span className="bg-gradient-to-r from-uho-accent via-uho-accent-light to-uho-accent bg-clip-text text-transparent">Agent-native Solana Indexing</span>
            <br />
            <span className="text-uho-text-primary">
              for your application
            </span>
          </h1>

          <p className="text-lg md:text-xl text-uho-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            Feed it an IDL, get a typed API in minutes. Postgres tables, REST endpoints,
            and WebSocket subscriptions — auto-generated from your program&apos;s events.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 bg-uho-accent text-uho-base font-semibold px-7 py-3.5 rounded-full hover:bg-uho-accent-light transition-all shadow-accent-glow hover:shadow-accent-glow-lg"
            >
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="https://github.com/zhivkoto/uho-indexing"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 text-uho-text-secondary font-medium px-7 py-3.5 rounded-full border border-uho-border hover:border-uho-border-emphasis hover:text-uho-text-primary transition-all"
            >
              <Github className="w-4 h-4" />
              View Source
            </a>
          </div>
        </div>

        {/* Terminal */}
        <div className="max-w-3xl mx-auto">
          <AnimatedTerminal />
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─── */
const features = [
  {
    icon: Database,
    title: 'IDL → Typed Schema',
    desc: 'Upload your Anchor IDL, get PostgreSQL tables with correct types for every event field. No manual migrations.',
  },
  {
    icon: Zap,
    title: 'Instant REST APIs',
    desc: 'Auto-generated endpoints with filtering, pagination, and sorting. Query events by any field out of the box.',
  },
  {
    icon: Radio,
    title: 'Real-Time Streams',
    desc: 'WebSocket subscriptions push events the moment they land on-chain. Sub-second for dashboards and bots.',
  },
  {
    icon: Users,
    title: 'Multi-Tenant Isolation',
    desc: 'Each project gets its own schema and endpoints. One account, unlimited indexers, zero interference.',
  },
];

function Features() {
  return (
    <section id="features" className="py-24 px-6 relative">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-uho-accent mb-3">
            Capabilities
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-uho-text-primary mb-4">
            Everything you need to index Solana
          </h2>
          <p className="text-uho-text-secondary text-lg max-w-xl mx-auto">
            From IDL to production API in minutes, not weeks.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-uho-border bg-uho-raised/50 p-7 hover:border-uho-accent/30 hover:bg-uho-raised transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-uho-accent/10 border border-uho-accent/20 flex items-center justify-center mb-4 group-hover:shadow-accent-glow transition-shadow">
                <f.icon className="w-5 h-5 text-uho-accent" />
              </div>
              <h3 className="text-lg font-semibold text-uho-text-primary mb-2">{f.title}</h3>
              <p className="text-uho-text-secondary text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
const steps = [
  { icon: Upload, num: '01', title: 'Upload Your IDL', desc: 'Paste or upload your Anchor IDL file. Uho parses every event type and field automatically.' },
  { icon: Cpu, num: '02', title: 'Auto-Index Events', desc: 'Tables are created, indexing starts immediately. Historical backfill runs in parallel.' },
  { icon: Search, num: '03', title: 'Query & Subscribe', desc: 'Hit your REST endpoints or open a WebSocket. Filter, paginate, aggregate — production-ready.' },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-uho-accent mb-3">
            Workflow
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-uho-text-primary">
            Three steps. That&apos;s it.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-[28px] left-[20%] right-[20%] h-px border-t border-dashed border-uho-border-emphasis" />

          {steps.map((s) => (
            <div key={s.num} className="relative text-center">
              <div className="w-14 h-14 rounded-2xl bg-uho-elevated border border-uho-border flex items-center justify-center mx-auto mb-5 relative z-10">
                <s.icon className="w-6 h-6 text-uho-accent" />
              </div>
              <div className="font-mono text-xs text-uho-accent/60 mb-2">{s.num}</div>
              <h3 className="text-lg font-semibold text-uho-text-primary mb-2">{s.title}</h3>
              <p className="text-sm text-uho-text-secondary leading-relaxed max-w-[280px] mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Agent-Native Section ─── */
const agentFeatures = [
  {
    icon: Bot,
    title: 'Structured Output',
    desc: 'Every endpoint returns typed JSON that agents can parse without extraction. No HTML scraping, no guessing.',
  },
  {
    icon: Webhook,
    title: 'Webhook Triggers',
    desc: 'Push events to your agent\'s endpoint in real-time. Build reactive workflows without polling.',
  },
  {
    icon: FileJson,
    title: 'Schema Introspection',
    desc: 'Agents can discover available events, fields, and types via the /schema endpoint. Self-documenting APIs.',
  },
];

function AgentNative() {
  return (
    <section id="agents" className="py-24 px-6 border-t border-uho-border">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-uho-accent mb-3">
              Agent-Native
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-uho-text-primary mb-4">
              Built for the agentic era
            </h2>
            <p className="text-uho-text-secondary text-lg leading-relaxed mb-8">
              Uho isn&apos;t just developer-friendly — it&apos;s agent-friendly. Structured responses,
              introspectable schemas, and webhook-driven workflows make it the ideal data layer for
              autonomous Solana agents.
            </p>
            <div className="space-y-6">
              {agentFeatures.map((f) => (
                <div key={f.title} className="flex gap-4">
                  <div className="w-9 h-9 rounded-lg bg-uho-accent/10 border border-uho-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <f.icon className="w-4 h-4 text-uho-accent" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-uho-text-primary mb-1">{f.title}</h4>
                    <p className="text-sm text-uho-text-secondary leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Code snippet */}
          <div className="rounded-2xl border border-uho-border bg-uho-raised overflow-hidden shadow-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-uho-border bg-uho-elevated/50">
              <span className="text-xs text-uho-text-tertiary font-mono">agent.ts</span>
            </div>
            <pre className="p-6 font-mono text-[13px] leading-relaxed text-uho-text-secondary overflow-x-auto">
              <code>{`// Your agent queries Uho directly
const events = await fetch(
  "https://api.uho.dev/v1/my_program" +
  "/events/SwapExecuted" +
  "?where=amount.gte:1000" +
  "&order=slot.desc&limit=10"
);

// Typed, structured, zero parsing
const { data } = await events.json();
// → [{ user, amount, slot, tx, ... }]

// Or subscribe to real-time events
const ws = new WebSocket(
  "wss://api.uho.dev/v1/my_program/ws"
);
ws.send(JSON.stringify({
  subscribe: "SwapExecuted",
  filter: { amount: { gte: 1000 } }
}));`}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CTA() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center relative">
        <div className="absolute inset-0 bg-uho-accent/[0.03] rounded-3xl blur-[80px] pointer-events-none" />
        <div className="relative rounded-3xl border border-uho-border bg-uho-raised/80 backdrop-blur-sm p-12 md:p-16">
          <h2 className="text-3xl md:text-4xl font-bold text-uho-text-primary mb-4">
            Start indexing in minutes
          </h2>
          <p className="text-uho-text-secondary text-lg mb-8 max-w-lg mx-auto">
            No infrastructure to manage. No subgraph manifests. No YAML configs.
            Just your IDL and two commands.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 bg-uho-accent text-uho-base font-semibold px-8 py-3.5 rounded-full hover:bg-uho-accent-light transition-all shadow-accent-glow hover:shadow-accent-glow-lg text-lg"
            >
              Get Started
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <p className="text-xs text-uho-text-tertiary mt-6">
            Open source · Free tier available · No credit card required
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="border-t border-uho-border py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-uho-text-tertiary">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Uho" className="w-6 h-6 rounded-md" />
          <span>© 2026 Uho. Open-source Solana indexing.</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="https://github.com/zhivkoto/uho-indexing" className="hover:text-uho-text-secondary transition-colors flex items-center gap-1.5" target="_blank" rel="noopener">
            <Github className="w-4 h-4" /> GitHub
          </a>
          <a href="mailto:zhivko.p.todorov@gmail.com" className="hover:text-uho-text-secondary transition-colors flex items-center gap-1.5" target="_blank" rel="noopener">
            <Mail className="w-4 h-4" /> Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ─── */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-uho-base relative">
      <GridBackground />
      <div className="relative z-10">
        <Nav />
        <Hero />
        {/* StatsBar removed */}
        <Features />
        <HowItWorks />
        <AgentNative />
        <CTA />
        <Footer />
      </div>
    </div>
  );
}

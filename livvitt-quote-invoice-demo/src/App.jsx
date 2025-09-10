\
import React, { useEffect, useMemo, useRef, useState } from "react";

// --- Simple currency + id helpers ---
const money = (n) => (isNaN(n) ? "$0.00" : n.toLocaleString(undefined, { style: "currency", currency: "USD" }));
const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);

// --- Default price book (edit in Settings tab) ---
const DEFAULT_PRICE_BOOK = {
  sqft: {
    Banner: 8, // $/ft²
    PVC_6mm: 20,
    PVC_9mm: 24,
    PVC_12mm: 30,
    PVC_15mm: 36,
    Dibond_4mm: 28,
  },
  unit: {
    AFrame_White: 225,
    AFrame_Black: 225,
    StandUpBanner: 180,
  },
  options: {
    lamination_per_sqft: 4,
    grommet_each: 0.5,
  },
  install: { hourly_rate: 75, crew_min_hours: 2 },
  document: { tax_rate: 0.05, discount_mode: "amount" }, // 5% default; toggle in Settings
};

// --- Statuses for the tracker ---
const STATUSES = [
  "Draft",
  "Quoted",
  "Approved",
  "Scheduled",
  "Installed",
  "Invoiced",
  "Paid",
];

// --- Storage keys ---
const LS_QUOTES_KEY = "livvitt.quotes";
const LS_SETTINGS_KEY = "livvitt.settings";
const LS_COUNTERS_KEY = "livvitt.counters";

function nextNumber(kind = "Quote") {
  const counters = JSON.parse(localStorage.getItem(LS_COUNTERS_KEY) || "{}");
  const year = new Date().getFullYear();
  const key = `${kind}-${year}`;
  counters[key] = (counters[key] || 0) + 1;
  localStorage.setItem(LS_COUNTERS_KEY, JSON.stringify(counters));
  const seq = String(counters[key]).padStart(4, "0");
  const prefix = kind === "Invoice" ? "LVI" : "LVQ";
  return `${prefix}-${year}-${seq}`;
}

// --- Demo seed ---
const demoSeed = (priceBook) => ({
  id: uid(),
  kind: "Quote",
  number: nextNumber("Quote"),
  status: "Draft",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  customer: {
    name: "Top 1 Toys (Demo)",
    email: "orders@top1toys.sx",
    phone: "+1 721-555-0101",
    billingAddress: "Sky Building, Welfare Rd, Cole Bay",
  },
  job: {
    siteAddress: "Sky Building Rooftop, Cole Bay",
    installDate: todayISO(),
    crew: ["Joel", "Camilo"],
    hours: priceBook.install.crew_min_hours,
    hourlyRate: priceBook.install.hourly_rate,
    taxInstall: true,
  },
  terms: "50% deposit to schedule. Balance due upon installation.",
  notes: "Rooftop bracket weld + sign mount per sketch.",
  taxRate: priceBook.document.tax_rate,
  discount: 0,
  discountMode: priceBook.document.discount_mode, // 'amount' | 'percent'
  items: [
    {
      id: uid(),
      type: "PVC_12mm",
      label: "12mm PVC panel 4ft x 3ft",
      width_ft: 4,
      height_ft: 3,
      qty: 2,
      doubleSided: false,
      lamination: true,
      grommets: 0,
      unitPrice: null, // auto from book
      unitType: "sqft",
    },
    {
      id: uid(),
      type: "AFrame_White",
      label: "A‑Frame sidewalk sign (white)",
      width_ft: 0,
      height_ft: 0,
      qty: 1,
      doubleSided: true,
      lamination: false,
      grommets: 0,
      unitPrice: null,
      unitType: "unit",
    },
  ],
});

function useLocalState(key, initial) {
  const [state, setState] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : initial;
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(state)), [key, state]);
  return [state, setState];
}

function computeItemSubtotal(item, priceBook) {
  const { unitType, type, width_ft, height_ft, qty, doubleSided, lamination, grommets } = item;
  let base = 0;
  if (unitType === "sqft") {
    const area = Math.max(0, (width_ft || 0) * (height_ft || 0));
    const perSq = priceBook.sqft[type] || 0;
    base = area * perSq;
    if (lamination) base += area * (priceBook.options.lamination_per_sqft || 0);
    if (doubleSided) base *= 2;
    if (grommets) base += (priceBook.options.grommet_each || 0) * grommets;
    base = Math.max(base, 25); // minimum per item
    return base * (qty || 0);
  } else if (unitType === "unit") {
    const unitPrice = priceBook.unit[type] || 0;
    let single = unitPrice;
    if (doubleSided) single *= 2; // simple rule for demo
    return single * (qty || 0);
  }
  return 0;
}

function computeTotals(doc, priceBook) {
  const itemsSubtotal = (doc.items || []).reduce((sum, it) => sum + computeItemSubtotal(it, priceBook), 0);
  const installTotal = (doc.job?.hours || 0) * (doc.job?.hourlyRate || 0);
  const discount = doc.discountMode === "percent" ? (itemsSubtotal + installTotal) * ((doc.discount || 0) / 100) : (doc.discount || 0);
  const taxableBase = itemsSubtotal + (doc.job?.taxInstall ? installTotal : 0) - discount;
  const tax = Math.max(0, taxableBase) * (doc.taxRate || 0);
  const total = Math.max(0, itemsSubtotal + installTotal - discount + tax);
  return { itemsSubtotal, installTotal, discount, tax, total };
}

function Section({ title, children, right }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <label className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 items-center py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="md:col-span-2">{children}</div>
    </label>
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      className={
        "w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 " +
        className
      }
      {...props}
    />
  );
}

function Select({ className = "", children, ...props }) {
  return (
    <select
      className={
        "w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none bg-white focus:ring-2 focus:ring-sky-500 " +
        className
      }
      {...props}
    >
      {children}
    </select>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border ${
        checked ? "bg-sky-50 border-sky-300 text-sky-700" : "bg-white border-gray-300 text-gray-700"
      }`}
    >
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${checked ? "bg-sky-500" : "bg-gray-300"}`} />
      {label}
    </button>
  );
}

export default function LivvittQuoteInvoiceDemo() {
  const [settings, setSettings] = useLocalState(LS_SETTINGS_KEY, DEFAULT_PRICE_BOOK);
  const [quotes, setQuotes] = useLocalState(LS_QUOTES_KEY, []);
  const [tab, setTab] = useState("Document"); // Document | Pipeline | Settings
  const [doc, setDoc] = useState(() => demoSeed(settings));

  useEffect(() => {
    // keep tax/discount mode in sync with settings while editing a new doc
    setDoc((d) => ({ ...d, taxRate: settings.document.tax_rate, discountMode: settings.document.discount_mode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.document.tax_rate, settings.document.discount_mode]);

  const totals = useMemo(() => computeTotals(doc, settings), [doc, settings]);

  const saveDoc = () => {
    const now = new Date().toISOString();
    const entry = { ...doc, updatedAt: now };
    const idx = quotes.findIndex((q) => q.id === doc.id);
    if (idx >= 0) {
      const next = quotes.slice();
      next[idx] = entry;
      setQuotes(next);
    } else {
      setQuotes([{ ...entry }, ...quotes]);
    }
    alert(`${doc.kind} saved: ${doc.number}`);
  };

  const newQuote = () => {
    setDoc(demoSeed(settings));
    setTab("Document");
  };

  const convertToInvoice = () => {
    const number = nextNumber("Invoice");
    setDoc((d) => ({ ...d, kind: "Invoice", number, status: "Invoiced" }));
  };

  const addItem = () => {
    const newItem = {
      id: uid(),
      type: "Banner",
      label: "Custom banner",
      width_ft: 4,
      height_ft: 2,
      qty: 1,
      doubleSided: false,
      lamination: false,
      grommets: 10,
      unitPrice: null,
      unitType: "sqft",
    };
    setDoc((d) => ({ ...d, items: [...d.items, newItem] }));
  };

  const removeItem = (id) => setDoc((d) => ({ ...d, items: d.items.filter((x) => x.id !== id) }));

  const pipelineByStatus = useMemo(() => {
    const groups = Object.fromEntries(STATUSES.map((s) => [s, []]));
    for (const q of quotes) groups[q.status]?.push(q);
    return groups;
  }, [quotes]);

  const pipelineStats = useMemo(() => {
    const by = {};
    for (const s of STATUSES) by[s] = 0;
    for (const q of quotes) {
      const pb = computeTotals(q, settings);
      by[q.status] += pb.total;
    }
    const max = Math.max(1, ...Object.values(by));
    return { by, max };
  }, [quotes, settings]);

  const printDoc = () => window.print();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-sky-600 grid place-items-center text-white font-black">L</div>
            <div>
              <div className="text-sm tracking-widest font-semibold text-slate-700">LIVVITT</div>
              <div className="text-xs text-slate-500 -mt-0.5">Quote • Invoice • Install Tracker</div>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            {[
              ["Document", "Document"],
              ["Pipeline", "Pipeline"],
              ["Settings", "Settings"],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`px-3 py-1.5 rounded-xl text-sm border ${
                  tab === k ? "bg-sky-50 border-sky-300 text-sky-800" : "bg-white border-slate-300 text-slate-700"
                }`}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
            <button onClick={newQuote} className="px-3 py-1.5 rounded-xl text-sm border bg-emerald-600 text-white">
              New Quote
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 print:py-0">
        {tab === "Document" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            {/* Left column: Customer + Job */}
            <div className="space-y-4 lg:space-y-6">
              <Section
                title={`${doc.kind} Details`}
                right={
                  <div className="flex gap-2">
                    <span className="text-xs px-2 py-1 rounded-lg bg-slate-100 border border-slate-300">{doc.number}</span>
                    <Select
                      value={doc.status}
                      onChange={(e) => setDoc({ ...doc, status: e.target.value })}
                      className="w-[150px]"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </div>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Row label="Kind">
                    <Select value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })}>
                      <option>Quote</option>
                      <option>Invoice</option>
                    </Select>
                  </Row>
                  <Row label="Created">
                    <Input value={doc.createdAt.slice(0, 10)} readOnly />
                  </Row>
                  <Row label="Customer Name">
                    <Input value={doc.customer.name} onChange={(e) => setDoc({ ...doc, customer: { ...doc.customer, name: e.target.value } })} />
                  </Row>
                  <Row label="Email">
                    <Input value={doc.customer.email} onChange={(e) => setDoc({ ...doc, customer: { ...doc.customer, email: e.target.value } })} />
                  </Row>
                  <Row label="Phone">
                    <Input value={doc.customer.phone} onChange={(e) => setDoc({ ...doc, customer: { ...doc.customer, phone: e.target.value } })} />
                  </Row>
                  <Row label="Billing Address">
                    <Input
                      value={doc.customer.billingAddress}
                      onChange={(e) => setDoc({ ...doc, customer: { ...doc.customer, billingAddress: e.target.value } })}
                    />
                  </Row>
                </div>
              </Section>

              <Section title="Installation & Schedule">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Row label="Site Address">
                    <Input
                      value={doc.job.siteAddress}
                      onChange={(e) => setDoc({ ...doc, job: { ...doc.job, siteAddress: e.target.value } })}
                    />
                  </Row>
                  <Row label="Install Date">
                    <Input
                      type="date"
                      value={doc.job.installDate}
                      onChange={(e) => setDoc({ ...doc, job: { ...doc.job, installDate: e.target.value } })}
                    />
                  </Row>
                  <Row label="Crew (comma‑sep)">
                    <Input
                      value={doc.job.crew.join(", ")}
                      onChange={(e) => setDoc({ ...doc, job: { ...doc.job, crew: e.target.value.split(/,\\s*/) } })}
                    />
                  </Row>
                  <Row label="Hours">
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={doc.job.hours}
                      onChange={(e) => setDoc({ ...doc, job: { ...doc.job, hours: parseFloat(e.target.value) || 0 } })}
                    />
                  </Row>
                  <Row label="Hourly Rate">
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      value={doc.job.hourlyRate}
                      onChange={(e) => setDoc({ ...doc, job: { ...doc.job, hourlyRate: parseFloat(e.target.value) || 0 } })}
                    />
                  </Row>
                  <Row label="Tax Install?">
                    <Toggle
                      checked={!!doc.job.taxInstall}
                      onChange={(v) => setDoc({ ...doc, job: { ...doc.job, taxInstall: v } })}
                      label={doc.job.taxInstall ? "Yes" : "No"}
                    />
                  </Row>
                </div>
              </Section>

              <Section title="Terms & Notes">
                <Row label="Payment Terms">
                  <Input value={doc.terms} onChange={(e) => setDoc({ ...doc, terms: e.target.value })} />
                </Row>
                <Row label="Job Notes">
                  <Input value={doc.notes} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} />
                </Row>
              </Section>

              <div className="flex gap-2 print:hidden">
                <button onClick={saveDoc} className="px-4 py-2 rounded-xl bg-sky-600 text-white">Save</button>
                <button onClick={convertToInvoice} className="px-4 py-2 rounded-xl bg-amber-600 text-white">Convert → Invoice</button>
                <button onClick={printDoc} className="px-4 py-2 rounded-xl bg-slate-800 text-white">Print / PDF</button>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${doc.number}.json`;
                    a.click();
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  Export JSON
                </button>
              </div>
            </div>

            {/* Right column: Items + Totals */}
            <div className="lg:col-span-2 space-y-4 lg:space-y-6">
              <Section
                title="Line Items"
                right={
                  <div className="flex gap-2">
                    <button onClick={addItem} className="px-3 py-1.5 rounded-xl border bg-white">+ Add Item</button>
                  </div>
                }
              >
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-2">Type</th>
                        <th className="py-2 pr-2">Label</th>
                        <th className="py-2 pr-2">W (ft)</th>
                        <th className="py-2 pr-2">H (ft)</th>
                        <th className="py-2 pr-2">Qty</th>
                        <th className="py-2 pr-2">Double</th>
                        <th className="py-2 pr-2">Lam</th>
                        <th className="py-2 pr-2">Grom</th>
                        <th className="py-2 pr-2 text-right">Subtotal</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.items.map((it) => {
                        const sub = computeItemSubtotal(it, settings);
                        return (
                          <tr key={it.id} className="border-t border-slate-200">
                            <td className="py-1.5 pr-2">
                              <Select
                                value={it.type}
                                onChange={(e) =>
                                  setDoc((d) => ({
                                    ...d,
                                    items: d.items.map((x) => (x.id === it.id ? { ...x, type: e.target.value } : x)),
                                  }))
                                }
                              >
                                <optgroup label="Per ft²">
                                  {Object.keys(settings.sqft).map((k) => (
                                    <option key={k} value={k}>
                                      {k}
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Per unit">
                                  {Object.keys(settings.unit).map((k) => (
                                    <option key={k} value={k}>
                                      {k}
                                    </option>
                                  ))}
                                </optgroup>
                              </Select>
                            </td>
                            <td className="py-1.5 pr-2 min-w-[200px]">
                              <Input
                                value={it.label}
                                onChange={(e) =>
                                  setDoc((d) => ({
                                    ...d,
                                    items: d.items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)),
                                  }))
                                }
                              />
                            </td>
                            <td className="py-1.5 pr-2 w-20">
                              <Input
                                type="number"
                                step="0.1"
                                value={it.width_ft}
                                onChange={(e) =>
                                  setDoc((d) => ({
                                    ...d,
                                    items: d.items.map((x) => (x.id === it.id ? { ...x, width_ft: parseFloat(e.target.value) || 0 } : x)),
                                  }))
                                }
                              />
                            </td>
                            <td className="py-1.5 pr-2 w-20">
                              <Input
                                type="number"
                                step="0.1"
                                value={it.height_ft}
                                onChange={(e) =>
                                  setDoc((d) => ({
                                    ...d,
                                    items: d.items.map((x) => (x.id === it.id ? { ...x, height_ft: parseFloat(e.target.value) || 0 } : x)),
                                  }))
                                }
                              />
                            </td>
                            <td className="py-1.5 pr-2 w-16">
                              <Input
                                type="number"
                                min={0}
                                value={it.qty}
                                onChange={(e) =>
                                  setDoc((d) => ({
                                    ...d,
                                    items: d.items.map((x) => (x.id === it.id ? { ...x, qty: parseInt(e.target.value || "0") } : x)),
                                  }))
                                }
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <Toggle
                                checked={!!it.doubleSided}
                                onChange={(v) =>
                                  setDoc((d) => ({
                                    ...d,
                                    items: d.items.map((x) => (x.id === it.id ? { ...x, doubleSided: v } : x)),
                                  }))
                                }
                                label={it.doubleSided ? "Yes" : "No"}
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <Toggle
                                checked={!!it.lamination}
                                onChange={(v) =>
                                  setDoc((d) => ({
                                    ...d,
                                    items: d.items.map((x) => (x.id === it.id ? { ...x, lamination: v } : x)),
                                  }))
                                }
                                label={it.lamination ? "Yes" : "No"}
                              />
                            </td>
                            <td className="py-1.5 pr-2 w-20">
                              <Input
                                type="number"
                                min={0}
                                value={it.grommets}
                                onChange={(e) =>
                                  setDoc((d) => ({
                                    ...d,
                                    items: d.items.map((x) => (x.id === it.id ? { ...x, grommets: parseInt(e.target.value || "0") } : x)),
                                  }))
                                }
                              />
                            </td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap">{money(sub)}</td>
                            <td className="py-1.5 text-right">
                              <button onClick={() => removeItem(it.id)} className="text-red-600 hover:underline">
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Summary">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Row label="Tax Rate">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={doc.taxRate}
                          onChange={(e) => setDoc({ ...doc, taxRate: parseFloat(e.target.value) || 0 })}
                        />
                        <span className="text-sm text-slate-500">(e.g., 0.05 = 5%)</span>
                      </div>
                    </Row>
                    <Row label="Discount">
                      <div className="flex items-center gap-2">
                        <Select
                          value={doc.discountMode}
                          onChange={(e) => setDoc({ ...doc, discountMode: e.target.value })}
                          className="w-28"
                        >
                          <option value="amount">Amount</option>
                          <option value="percent">Percent</option>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          value={doc.discount}
                          onChange={(e) => setDoc({ ...doc, discount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </Row>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex justify-between text-sm py-1">
                      <span>Items Subtotal</span>
                      <span>{money(totals.itemsSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm py-1">
                      <span>Installation</span>
                      <span>{money(totals.installTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm py-1">
                      <span>Discount</span>
                      <span>-{money(totals.discount)}</span>
                    </div>
                    <div className="flex justify-between text-sm py-1">
                      <span>Tax</span>
                      <span>{money(totals.tax)}</span>
                    </div>
                    <div className="border-t mt-2 pt-2 flex justify-between font-semibold text-base">
                      <span>Total</span>
                      <span>{money(totals.total)}</span>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Preview (Customer‑Facing)">
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-white p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-2xl font-bold tracking-wide">LIVVITT</div>
                        <div className="text-xs text-slate-500">Sint Maarten • +1 721‑000‑0000 • hello@livvitt.com</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-semibold">{doc.kind}</div>
                        <div className="text-sm text-slate-500">{doc.number}</div>
                        <div className="text-sm text-slate-500">Date: {todayISO()}</div>
                        <div className="text-sm"><span className="px-2 py-0.5 rounded-lg bg-slate-100 border">{doc.status}</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                      <div>
                        <div className="text-sm font-semibold mb-1">Bill To</div>
                        <div className="text-sm">{doc.customer.name}</div>
                        <div className="text-sm text-slate-600">{doc.customer.billingAddress}</div>
                        <div className="text-sm text-slate-600">{doc.customer.email} • {doc.customer.phone}</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-1">Installation</div>
                        <div className="text-sm">{doc.job.siteAddress}</div>
                        <div className="text-sm text-slate-600">Date: {doc.job.installDate} • Crew: {doc.job.crew.join(", ")}</div>
                        <div className="text-sm text-slate-600">Hours: {doc.job.hours} @ {money(doc.job.hourlyRate)}</div>
                      </div>
                    </div>

                    <table className="w-full text-sm mt-6">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left">Item</th>
                          <th className="py-2 text-left">Details</th>
                          <th className="py-2 text-right">Qty</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.items.map((it) => {
                          const sub = computeItemSubtotal(it, settings);
                          const area = (it.width_ft || 0) * (it.height_ft || 0);
                          return (
                            <tr key={it.id} className="border-b">
                              <td className="py-2 align-top font-medium">{it.label}</td>
                              <td className="py-2 align-top text-slate-600">
                                {it.unitType === "sqft" ? (
                                  <>
                                    {it.type} • {area.toFixed(1)} ft²
                                    {it.doubleSided ? " • double‑sided" : ""}
                                    {it.lamination ? " • lamination" : ""}
                                    {it.grommets ? ` • ${it.grommets} grommets` : ""}
                                  </>
                                ) : (
                                  <>{it.type}{it.doubleSided ? " • double‑sided" : ""}</>
                                )}
                              </td>
                              <td className="py-2 align-top text-right">{it.qty}</td>
                              <td className="py-2 align-top text-right">{money(sub)}</td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td colSpan={2}></td>
                          <td className="py-1 text-right text-slate-500">Items</td>
                          <td className="py-1 text-right">{money(totals.itemsSubtotal)}</td>
                        </tr>
                        <tr>
                          <td colSpan={2}></td>
                          <td className="py-1 text-right text-slate-500">Installation</td>
                          <td className="py-1 text-right">{money(totals.installTotal)}</td>
                        </tr>
                        <tr>
                          <td colSpan={2}></td>
                          <td className="py-1 text-right text-slate-500">Discount</td>
                          <td className="py-1 text-right">-{money(totals.discount)}</td>
                        </tr>
                        <tr>
                          <td colSpan={2}></td>
                          <td className="py-1 text-right text-slate-500">Tax</td>
                          <td className="py-1 text-right">{money(totals.tax)}</td>
                        </tr>
                        <tr className="border-t">
                          <td colSpan={2}></td>
                          <td className="py-2 text-right font-semibold">Total</td>
                          <td className="py-2 text-right font-semibold">{money(totals.total)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="text-sm text-slate-600 mt-4">
                      <div><span className="font-medium">Terms:</span> {doc.terms}</div>
                      <div className="mt-1">Make checks payable to <span className="font-medium">Livvitt</span>. Bank transfer details available on request.</div>
                    </div>
                  </div>
                </div>
              </Section>
            </div>
          </div>
        )}

        {tab === "Pipeline" && (
          <div className="space-y-6">
            <Section title="Quick Actions">
              <div className="flex flex-wrap gap-2">
                <button onClick={newQuote} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white">+ New Quote</button>
                <label className="px-3 py-1.5 rounded-xl border bg-white cursor-pointer">
                  Import JSON
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fr = new FileReader();
                      fr.onload = () => {
                        try {
                          const j = JSON.parse(String(fr.result || "{}"));
                          if (j && j.id) setQuotes([j, ...quotes]);
                          else alert("Not a Livvitt document JSON");
                        } catch (err) {
                          alert("Invalid JSON");
                        }
                      };
                      fr.readAsText(file);
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    if (!quotes.length) return alert("No saved quotes yet.");
                    const blob = new Blob([JSON.stringify(quotes, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `livvitt-pipeline.json`;
                    a.click();
                  }}
                  className="px-3 py-1.5 rounded-xl border bg-white"
                >
                  Export Pipeline JSON
                </button>
              </div>
            </Section>

            <Section title="Value by Status (quick chart)">
              <div className="space-y-2">
                {STATUSES.map((s) => {
                  const v = pipelineStats.by[s] || 0;
                  const pct = Math.round((v / pipelineStats.max) * 100);
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <div className="w-28 text-sm text-slate-600">{s}</div>
                      <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-28 text-right text-sm">{money(v)}</div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {STATUSES.map((s) => (
                <Section key={s} title={`${s} (${pipelineByStatus[s].length})`}>
                  <div className="space-y-2">
                    {pipelineByStatus[s].length === 0 && (
                      <div className="text-sm text-slate-500">Nothing here yet.</div>
                    )}
                    {pipelineByStatus[s].map((q) => {
                      const t = computeTotals(q, settings);
                      return (
                        <div key={q.id} className="p-3 rounded-xl border flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">{q.number}</div>
                            <div className="text-xs text-slate-500">{q.customer.name}</div>
                            <div className="text-xs text-slate-500">{new Date(q.updatedAt).toLocaleDateString()}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">{money(t.total)}</div>
                            <Select
                              value={q.status}
                              onChange={(e) => {
                                setQuotes((arr) => arr.map((x) => (x.id === q.id ? { ...x, status: e.target.value, updatedAt: new Date().toISOString() } : x)));
                              }}
                            >
                              {STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              ))}
            </div>
          </div>
        )}

        {tab === "Settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Price Book (per ft²)">
              <div className="space-y-2">
                {Object.entries(settings.sqft).map(([k, v]) => (
                  <Row key={k} label={k.replace(/_/g, " ")}> 
                    <Input
                      type="number"
                      step="0.5"
                      value={v}
                      onChange={(e) => setSettings({ ...settings, sqft: { ...settings.sqft, [k]: parseFloat(e.target.value) || 0 } })}
                    />
                  </Row>
                ))}
              </div>
            </Section>

            <Section title="Unit Pricing">
              <div className="space-y-2">
                {Object.entries(settings.unit).map(([k, v]) => (
                  <Row key={k} label={k.replace(/_/g, " ")}> 
                    <Input
                      type="number"
                      step="1"
                      value={v}
                      onChange={(e) => setSettings({ ...settings, unit: { ...settings.unit, [k]: parseFloat(e.target.value) || 0 } })}
                    />
                  </Row>
                ))}
              </div>
            </Section>

            <Section title="Options & Installation">
              <div className="space-y-2">
                <Row label="Lamination ($/ft²)">
                  <Input
                    type="number"
                    step="0.5"
                    value={settings.options.lamination_per_sqft}
                    onChange={(e) => setSettings({ ...settings, options: { ...settings.options, lamination_per_sqft: parseFloat(e.target.value) || 0 } })}
                  />
                </Row>
                <Row label="Grommet each ($)">
                  <Input
                    type="number"
                    step="0.25"
                    value={settings.options.grommet_each}
                    onChange={(e) => setSettings({ ...settings, options: { ...settings.options, grommet_each: parseFloat(e.target.value) || 0 } })}
                  />
                </Row>
                <Row label="Install hourly rate ($)">
                  <Input
                    type="number"
                    step="1"
                    value={settings.install.hourly_rate}
                    onChange={(e) => setSettings({ ...settings, install: { ...settings.install, hourly_rate: parseFloat(e.target.value) || 0 } })}
                  />
                </Row>
                <Row label="Crew min hours">
                  <Input
                    type="number"
                    step="0.5"
                    value={settings.install.crew_min_hours}
                    onChange={(e) => setSettings({ ...settings, install: { ...settings.install, crew_min_hours: parseFloat(e.target.value) || 0 } })}
                  />
                </Row>
              </div>
            </Section>

            <Section title="Document Defaults">
              <Row label="Tax rate (e.g., 0.05 = 5%)">
                <Input
                  type="number"
                  step="0.01"
                  value={settings.document.tax_rate}
                  onChange={(e) => setSettings({ ...settings, document: { ...settings.document, tax_rate: parseFloat(e.target.value) || 0 } })}
                />
              </Row>
              <Row label="Discount mode">
                <Select
                  value={settings.document.discount_mode}
                  onChange={(e) => setSettings({ ...settings, document: { ...settings.document, discount_mode: e.target.value } })}
                >
                  <option value="amount">Amount</option>
                  <option value="percent">Percent</option>
                </Select>
              </Row>
            </Section>
          </div>
        )}
      </main>

      {/* Print styles */}
      <style>{`
        @media print {
          header, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

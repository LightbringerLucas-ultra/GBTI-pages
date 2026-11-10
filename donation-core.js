(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GBTI_DONATION_CORE = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const tiers = Object.freeze([
    Object.freeze({id: 'spark', name: '星光致谢', minCents: 1, duration: 3400, color: '#75e8c7'}),
    Object.freeze({id: 'meteor', name: '流星礼花', minCents: 10, duration: 5100, color: '#c5a2ff'}),
    Object.freeze({id: 'nova', name: '星际庆典', minCents: 100, duration: 7200, color: '#ffd88c'})
  ]);
  function amountToCents(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
    if (!match) return null;
    const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
    return Number.isSafeInteger(cents) ? cents : null;
  }
  function tierFor(cents) {
    if (!Number.isSafeInteger(cents) || cents < 1) return null;
    return cents >= 100 ? tiers[2] : cents >= 10 ? tiers[1] : tiers[0];
  }
  function normalize(event, now = Date.now()) {
    if (!event || typeof event !== 'object') return null;
    if (typeof event.id !== 'string' || !/^[a-zA-Z0-9_.:-]{8,160}$/.test(event.id)) return null;
    const amountCents = event.amountCents;
    if (!tierFor(amountCents)) return null;
    const occurredAt = typeof event.occurredAt === 'number' ? event.occurredAt : Date.parse(event.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt > now + 30000 || occurredAt < now - 120000) return null;
    const nickname=typeof event.nickname==='string'&&/^[\p{L}\p{N} ._·-]{1,20}$/u.test(event.nickname)?event.nickname:'';
    const intentId=typeof event.intentId==='string'&&/^[a-f0-9]{48}$/.test(event.intentId)?event.intentId:'';
    return {id: event.id, amountCents, occurredAt, nickname, intentId, tier: tierFor(amountCents)};
  }
  function format(cents) { return (cents / 100).toFixed(2); }
  return Object.freeze({tiers, amountToCents, tierFor, normalize, format});
});

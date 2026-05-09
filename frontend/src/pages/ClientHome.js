import React, { useMemo, useRef, useState } from 'react';
import './ClientHome.css';

const CARD_MIN = 1450;
const CARD_MAX = 1806;

const validNameRegex = /^[A-Za-z\s]{2,}$/;

const PRIZE_CARDS = [
  { title: '10% Food Discount', desc: 'Enjoy exclusive dining savings.', accent: 'food' },
  { title: '10% Drink Discount', desc: 'Get better value on premium beverages.', accent: 'drink' },
  { title: 'Free Food Combo', desc: 'A full combo—built for celebrations.', accent: 'freeFood' },
  { title: 'Free Drink Combo', desc: 'Tasty drinks for every moment.', accent: 'freeDrink' },
  { title: 'VIP Combo Offer', desc: 'Rare VIP rewards for top members.', accent: 'vip' },
];

const PARTNER_CARDS = [
  { name: 'Lambrico Lounge', desc: 'Partner business (currently active).', badge: 'Current Partner' },
  { name: 'Restaurants', desc: 'Join for exclusive discount campaigns.', badge: 'Coming Soon' },
  { name: 'Hotels & Lounges', desc: 'Premium nights. Premium rewards.', badge: 'Coming Soon' },
  { name: 'Stores & Events', desc: 'More brands, more winnings.', badge: 'Coming Soon' },
];

const formatCardNumber = (raw) => {
  const v = String(raw || '').trim().toUpperCase();
  const match = v.match(/^A(\d+)$/);
  if (!match) return '';
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return '';
  return `A${num.toString().padStart(5, '0')}`;
};

const normalizePhone = (raw) => {
  const v = String(raw || '').trim();
  if (/^6\d{8}$/.test(v)) return `+237${v}`;
  return v;
};

const isValidPhoneInput = (raw) => {
  const v = String(raw || '').trim();
  return /^6\d{8}$/.test(v) || /^\+2376\d{8}$/.test(v);
};

const isValidCardFormat = (card) => /^A\d{5}$/.test(card);
const isCardInMasterRange = (card) => {
  const m = card.match(/^A(\d{5})$/);
  if (!m) return false;
  const num = Number(m[1]);
  return num >= CARD_MIN && num <= CARD_MAX;
};

const ClientHome = () => {
  const checkRef = useRef(null);

  const [form, setForm] = useState({ name: '', phone: '', card_number: '' });
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);
  const [errors, setErrors] = useState({ name: '', phone: '', card_number: '' });

  const isFormValid = useMemo(() => {
    return (
      !errors.name &&
      !errors.phone &&
      !errors.card_number &&
      form.name.trim().length > 0 &&
      form.phone.trim().length > 0 &&
      form.card_number.trim().length > 0
    );
  }, [errors, form]);

  const validateField = (field, value) => {
    const v = String(value || '');
    if (field === 'name') {
      if (!v.trim()) return 'Full Name is required';
      if (!validNameRegex.test(v.trim())) return 'Use letters and spaces only (min 2 chars)';
      return '';
    }

    if (field === 'phone') {
      if (!v.trim()) return 'Cameroon phone number is required';
      if (!isValidPhoneInput(v.trim())) return 'Use 6XXXXXXXX or +2376XXXXXXXX';
      return '';
    }

    if (field === 'card_number') {
      if (!v.trim()) return 'Coupon Card Number is required';
      const formatted = formatCardNumber(v);
      if (!formatted) return 'Invalid card format (must be A followed by 5 digits, e.g., A12345)';
      if (!isValidCardFormat(formatted)) return 'Invalid card format (must be A followed by 5 digits, e.g., A12345)';
      if (!isCardInMasterRange(formatted)) return `Invalid card number. Valid range is A${String(CARD_MIN).padStart(5, '0')} to A${String(CARD_MAX).padStart(5, '0')}`;
      return '';
    }

    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    if (name === 'card_number') nextValue = value.toUpperCase().slice(0, 6);

    setForm((prev) => ({ ...prev, [name]: nextValue }));

    const formatted =
      name === 'card_number' ? formatCardNumber(nextValue) : nextValue;

    const err = validateField(name, formatted);
    setErrors((prev) => ({ ...prev, [name]: err }));
  };

  const onCheck = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;

    const payload = {
      full_name: form.name.trim(),
      phone_number: normalizePhone(form.phone.trim()),
      coupon_code: formatCardNumber(form.card_number),
    };

    setLoading(true);
    setAlert(null);

    try {
      const response = await fetch('http://localhost:5001/api/check-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setAlert({ type: 'error', message: data.message || 'Something went wrong.' });
        setLoading(false);
        return;
      }

      if (data.status === 'won') {
        setAlert({
          type: 'success',
          message: `🎉 Congratulations! Your card is a winning card.\n\nPrize: ${data.prize}\n\nVisit Lambrico Lounge to redeem your prize.`,
        });
      } else if (data.status === 'lost') {
        setAlert({
          type: 'error',
          message: `❌ Sorry, this card did not win this time.`,
        });
      } else if (data.status === 'already_claimed') {
        setAlert({
          type: 'error',
          message: data.message || 'This card has already been redeemed.',
        });
      } else if (data.status === 'invalid_card') {
        setAlert({
          type: 'warning',
          message: '⚠ Invalid Coupon Card Number',
        });
      } else {
        setAlert({
          type: 'error',
          message: data.message || 'Unable to check your coupon right now.',
        });
      }
    } catch (err) {
      setAlert({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const scrollToChecker = () => {
    if (checkRef.current) checkRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="jnloya-page">
      {/* Sticky Premium Navbar */}
      <header className="jnloya-navbar">
        <div className="jnloya-navbar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              J
            </div>
            <div className="brand-text">
              <div className="brand-name">J&N LOYA</div>
              <div className="brand-tagline">Exclusive Premium</div>
            </div>
          </div>

          <nav className="nav-links" aria-label="Top navigation">
            <button className="nav-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Home
            </button>
            <button className="nav-link" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
              How it works
            </button>
            <button className="nav-link" onClick={() => document.getElementById('partners')?.scrollIntoView({ behavior: 'smooth' })}>
              Partners
            </button>
            <button className="nav-link" onClick={() => document.getElementById('rewards')?.scrollIntoView({ behavior: 'smooth' })}>
              Winning rewards
            </button>
            <button className="nav-link nav-link-cta" onClick={scrollToChecker}>
              Check your card
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="hero-overlay" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-kicker">MORE VALUE. MORE DISCOUNTS. MORE YOU.</div>
            <h1 className="hero-title">Premium rewards—made for exclusive moments.</h1>
            <p className="hero-subtitle">
              J&N LOYA connects customers to premium businesses offering exclusive discounts, rewards, and promotional winnings.
            </p>

            <div className="hero-actions">
              <button className="btn-primary" onClick={scrollToChecker}>
                Check Your Card
              </button>
              <button className="btn-secondary" type="button">
                Become a Partner
              </button>
            </div>

            <div className="hero-note">
              Current partner: <span className="hero-note-strong">Lambrico Lounge</span>
            </div>
          </div>

        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="section">
        <h2 className="section-title">How it works</h2>
        <div className="cards-3">
          <div className="premium-card">
            <div className="icon">🛍️</div>
            <h3>1) Buy Coupon Card</h3>
            <p>Purchase your premium coupon card and get ready to win.</p>
          </div>
          <div className="premium-card">
            <div className="icon">🧾</div>
            <h3>2) Scratch & Enter Code</h3>
            <p>Enter your card number to instantly check your result.</p>
          </div>
          <div className="premium-card">
            <div className="icon">🏆</div>
            <h3>3) Win Discounts & Rewards</h3>
            <p>Claim exclusive premium discounts and combo offers.</p>
          </div>
        </div>
      </section>

      {/* Partners */}
      <section id="partners" className="section section-alt">
        <h2 className="section-title">Partner Network</h2>
        <p className="section-subtitle">
          J&N LOYA is a multi-partner rewards and discount ecosystem. Many business brands can join over time.
        </p>

        <div className="partner-grid">
          {PARTNER_CARDS.map((p) => (
            <div className="partner-card" key={p.name}>
              <div className="partner-badge">{p.badge}</div>
              <div className="partner-logo" aria-hidden="true">
                {p.name.slice(0, 1)}
              </div>
              <div className="partner-name">{p.name}</div>
              <div className="partner-desc">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Rewards */}
      <section id="rewards" className="section">
        <h2 className="section-title">Winning Rewards</h2>
        <div className="reward-grid">
          {PRIZE_CARDS.map((r) => (
            <div className={`reward-card ${r.accent}`} key={r.title}>
              <div className="reward-title">{r.title}</div>
              <div className="reward-desc">{r.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Customer Coupon Checker */}
      <section ref={checkRef} className="section section-alt checker">
        <div className="checker-head">
          <div>
            <h2 className="section-title">Customer Card Checker</h2>
            <p className="section-subtitle">
              Enter your details to check whether your coupon card is a winner.
            </p>
          </div>
        </div>

        <div className="checker-grid">
          <div className="checker-panel">
            <form onSubmit={onCheck} className="checker-form">
              <div className="field">
                <label className="label">Full Name</label>
                <input
                  type="text"
                  name="name"
                  placeholder="Your full name"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
                {errors.name && <span className="error-text">{errors.name}</span>}
              </div>

              <div className="field">
                <label className="label">Cameroon Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="6XXXXXXXX or +2376XXXXXXXX"
                  value={form.phone}
                  onChange={handleChange}
                  required
                />
                {errors.phone && <span className="error-text">{errors.phone}</span>}
              </div>

              <div className="field">
                <label className="label">Coupon Card Number</label>
                <input
                  type="text"
                  name="card_number"
                  placeholder="Input 5-digit number"
                  value={form.card_number}
                  onChange={handleChange}
                  required
                />
                {errors.card_number && <span className="error-text">{errors.card_number}</span>}
              </div>

              <button className="btn-primary btn-checker" disabled={loading || !isFormValid} type="submit">
                {loading ? 'Checking...' : 'Check Your Card'}
              </button>
            </form>

            {alert && (
              <div className={`result-card ${alert.type}`}>
                <div className="result-inner">
                  <div className="result-head">
                    {alert.type === 'success' ? <span className="result-emoji">🎉</span> : null}
                    {alert.type === 'error' ? <span className="result-emoji">✨</span> : null}
                    {alert.type === 'warning' ? <span className="result-emoji">⚠️</span> : null}
                    <div className="result-title">
                      {alert.type === 'success' ? 'Congratulations!' : alert.type === 'warning' ? 'Invalid' : 'Result'}
                    </div>
                  </div>
                  <div className="result-message">{alert.message}</div>
                  {alert.type === 'success' ? (
                    <div className="redeem-tip">
                      Redeem at: <span className="redeem-tip-strong">Lambrico Lounge</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="checker-side">
            <div className="side-card">
              <div className="side-title">About J&N LOYA</div>
              <div className="side-text">
                Exclusive Premium rewards across premium partner businesses—built to grow into a multi-brand ecosystem.
              </div>
              <div className="side-list">
                <div className="side-item">✅ Premium UX</div>
                <div className="side-item">✅ Admin-controlled redemption</div>
                <div className="side-item">✅ Partner-ready ecosystem</div>
              </div>
            </div>

            <div className="side-card side-card-cta">
              <div className="side-title">Partners</div>
              <div className="side-text">Ready to join? Create premium coupon campaigns and win new customers.</div>
              <button className="btn-secondary btn-full" type="button">
                Become a Partner
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="jnloya-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-mark" aria-hidden="true">J&N</div>
            <div>
              <div className="footer-title">J&N LOYA</div>
              <div className="footer-sub">Exclusive Premium • Multi-partner rewards ecosystem</div>
            </div>
          </div>

          <div className="footer-links">
            <button className="footer-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ClientHome;

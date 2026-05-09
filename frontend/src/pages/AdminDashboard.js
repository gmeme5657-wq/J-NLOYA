import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css';

const PRIZE_TYPES = [
  '10% Food Discount',
  '10% Drink Discount',
  'Free Food Combo',
  'Free Drink Combo',
  'VIP Combo Offer',
];

const AdminDashboard = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [winningCards, setWinningCards] = useState([]);

  const [activeMenu, setActiveMenu] = useState('winning'); // dashboard | entries | winning | partners | statistics | settings
  const [searchQ, setSearchQ] = useState('');
  const [filterResult, setFilterResult] = useState(''); // Won / Lost
  const [filterRedeemed, setFilterRedeemed] = useState(''); // true / false

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // cardNumber -> { cardNumberDraft, prize, redeemed }
  const [editingMap, setEditingMap] = useState({});

  const requireLogin = () => {
    if (!localStorage.getItem('admin_logged_in')) {
      navigate('/admin/login');
      return false;
    }
    return true;
  };

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
    }),
    []
  );

  const buildEntriesUrl = () => {
    const params = new URLSearchParams();
    if (searchQ.trim()) params.set('q', searchQ.trim());
    if (filterResult) params.set('result', filterResult);
    if (filterRedeemed) params.set('redeemed', filterRedeemed);
    const qs = params.toString();
    return `http://127.0.0.1:5001/api/admin/entries${qs ? `?${qs}` : ''}`;
  };

  const fetchAll = async () => {
    if (!requireLogin()) return;

    setLoading(true);
    setError('');
    try {
      const statsRes = await fetch('http://127.0.0.1:5001/api/admin/stats', { credentials: 'include' });
      const entriesRes = await fetch(buildEntriesUrl(), { credentials: 'include' });
      const cardsRes = await fetch('http://127.0.0.1:5001/api/admin/winning-cards', { credentials: 'include' });

      const [statsData, entriesData, cardsData] = await Promise.all([statsRes.json(), entriesRes.json(), cardsRes.json()]);

      if (!statsRes.ok) throw new Error(statsData?.error || 'Failed to fetch stats');
      if (!entriesRes.ok) throw new Error(entriesData?.error || 'Failed to fetch entries');
      if (!cardsRes.ok) throw new Error(cardsData?.error || 'Failed to fetch winning cards');

      setStats(statsData);
      setEntries(entriesData);
      setWinningCards(cardsData);
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin_logged_in');
    navigate('/admin/login');
  };

  const applyFilters = async (e) => {
    e?.preventDefault?.();
    await fetchAll();
  };

  const updateWinningCard = async (cardNumber, patch) => {
    // Existing API (does not support card_number change)
    const res = await fetch('http://127.0.0.1:5001/api/admin/winning-cards', {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({ card_number: cardNumber, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to update winning card');
  };

  const deleteWinningCard = async (cardNumber) => {
    const res = await fetch('http://127.0.0.1:5001/api/admin/winning-cards', {
      method: 'DELETE',
      credentials: 'include',
      headers,
      body: JSON.stringify({ card_number: cardNumber }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to delete winning card');
    return data;
  };

  const bulkUpsertWinningCards = async (cards) => {
    const res = await fetch('http://127.0.0.1:5001/api/winning-cards/bulk', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ cards }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to bulk upsert winning cards');
    return data;
  };

  const startEdit = (card) => {
    setEditingMap((prev) => ({
      ...prev,
      [card.card_number]: {
        cardNumberDraft: card.card_number,
        prize: card.prize || PRIZE_TYPES[0],
        redeemed: !!card.redeemed,
      },
    }));
  };

  const cancelEdit = (originalCardNumber) => {
    setEditingMap((prev) => {
      const next = { ...prev };
      delete next[originalCardNumber];
      return next;
    });
  };

  const saveEdit = async (originalCardNumber) => {
    const draft = editingMap[originalCardNumber];
    if (!draft) return;

    // If card_number changed: use bulk endpoint to upsert new card, then delete old
    const newCardNumber = String(draft.cardNumberDraft || '').trim().toUpperCase();
    const prize = draft.prize;
    const redeemed = !!draft.redeemed;

    if (!newCardNumber) {
      throw new Error('Card number is required');
    }

    // NOTE: bulk endpoint expects prize + partner_name. Our admin table doesn't edit partner_name,
    // so we infer it from the existing record if possible; otherwise default to Lambrisco Lounge.
    const original = winningCards.find((c) => c.card_number === originalCardNumber);
    const partnerName = original?.partner_name || 'Lambrisco Lounge';

    if (newCardNumber !== originalCardNumber) {
      await bulkUpsertWinningCards([
        {
          card_number: newCardNumber,
          prize,
          partner_name: partnerName,
        },
      ]);

      await deleteWinningCard(originalCardNumber);

      // Mark redeemed state if needed
      if (redeemed) {
        await updateWinningCard(newCardNumber, { redeemed: true });
      } else {
        // bulkUpsert sets redeemed=0; keep as pending
      }

      await fetchAll();
      cancelEdit(originalCardNumber);
      return;
    }

    // If card_number unchanged: we can patch prize/redeemed directly
    await updateWinningCard(originalCardNumber, { prize, redeemed });
    await fetchAll();
    cancelEdit(originalCardNumber);
  };

  const toggleRedeemedQuick = async (cardNumber, nextRedeemed) => {
    await updateWinningCard(cardNumber, { redeemed: !!nextRedeemed });
    await fetchAll();
  };

  const handleDelete = async (cardNumber) => {
    const ok = window.confirm(`Delete winning card ${cardNumber}?`);
    if (!ok) return;
    await deleteWinningCard(cardNumber);
    await fetchAll();
  };

  const hasFilters = !!(searchQ.trim() || filterResult || filterRedeemed);

  const menuItems = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'entries', label: 'Customer Entries' },
    { key: 'winning', label: 'Winning Cards' },
    { key: 'partners', label: 'Partners' },
    { key: 'statistics', label: 'Statistics' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="sidebar-top">
          <div className="sidebar-logo" aria-hidden="true">
            J&N
          </div>
          <div className="sidebar-brand">
            <div className="sidebar-brand-name">J&N LOYA</div>
            <div className="sidebar-brand-sub">Exclusive Premium</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Admin sidebar">
          {menuItems.map((item) => (
            <button
              key={item.key}
              className={`sidebar-link ${activeMenu === item.key ? 'active' : ''}`}
              onClick={() => setActiveMenu(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="sidebar-logout" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <div className="admin-heading">Admin Dashboard</div>
            <div className="admin-subheading">Coupon Card Winning System • Lambrico Lounge</div>
          </div>

          <div className="admin-top-actions">
            <button className="admin-refresh" type="button" onClick={fetchAll} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </header>

        {error ? <div className="admin-toast error">{error}</div> : null}

        {(activeMenu === 'dashboard' || activeMenu === 'statistics') && stats ? (
          <section className="analytics-grid">
            <div className="analytics-card">
              <div className="analytics-label">Total Cards</div>
              <div className="analytics-value">{stats.totalCards ?? '-'}</div>
            </div>
            <div className="analytics-card">
              <div className="analytics-label">Total Winners</div>
              <div className="analytics-value">{stats.totalWinners ?? '-'}</div>
            </div>
            <div className="analytics-card">
              <div className="analytics-label">Total Losers</div>
              <div className="analytics-value">{stats.totalLosers ?? '-'}</div>
            </div>
            <div className="analytics-card">
              <div className="analytics-label">Redeemed Rewards</div>
              <div className="analytics-value">{stats.redeemedPrizes ?? '-'}</div>
            </div>
            <div className="analytics-card">
              <div className="analytics-label">Pending Redemptions</div>
              <div className="analytics-value">{stats.pendingRedemptions ?? '-'}</div>
            </div>
          </section>
        ) : null}

        {activeMenu === 'entries' ? (
          <section className="panel">
            <div className="panel-head">
              <h2>Customer Entries</h2>
              <form className="filters" onSubmit={applyFilters}>
                <input
                  className="filter-input"
                  placeholder="Search name / phone / card"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                />

                <select className="filter-select" value={filterResult} onChange={(e) => setFilterResult(e.target.value)}>
                  <option value="">Result (All)</option>
                  <option value="Won">Won</option>
                  <option value="Lost">Lost</option>
                </select>

                <select className="filter-select" value={filterRedeemed} onChange={(e) => setFilterRedeemed(e.target.value)}>
                  <option value="">Redeemed (All)</option>
                  <option value="true">Redeemed</option>
                  <option value="false">Not Redeemed</option>
                </select>

                <button className="admin-btn" type="submit" disabled={loading || !hasFilters}>
                  Apply
                </button>
                <button
                  className="admin-btn ghost"
                  type="button"
                  onClick={() => {
                    setSearchQ('');
                    setFilterResult('');
                    setFilterRedeemed('');
                    fetchAll();
                  }}
                  disabled={loading}
                >
                  Reset
                </button>
              </form>
            </div>

            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Phone Number</th>
                    <th>Card Number</th>
                    <th>Result</th>
                    <th>Prize</th>
                    <th>Date</th>
                    <th>Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty-cell">
                        No entries found.
                      </td>
                    </tr>
                  ) : (
                    entries.map((en) => (
                      <tr key={en.id}>
                        <td>{en.name}</td>
                        <td>{en.phone}</td>
                        <td>{en.card_number}</td>
                        <td>
                          <span className={`pill ${en.result === 'Won' ? 'won' : 'lost'}`}>{en.result}</span>
                        </td>
                        <td>{en.prize || '-'}</td>
                        <td>{en.date ? String(en.date).replace('T', ' ') : '-'}</td>
                        <td>{en.redeemed ? 'Yes' : 'No'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeMenu === 'winning' ? (
          <section className="panel">
            <div className="panel-head">
              <h2>Winning Cards</h2>
              <div className="panel-note">Edit card number • Edit prize • Mark redeemed • Delete</div>
            </div>

            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Card Number</th>
                    <th>Prize</th>
                    <th>Redeemed</th>
                    <th style={{ width: 310 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {winningCards.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-cell">
                        No winning cards found.
                      </td>
                    </tr>
                  ) : (
                    winningCards.map((card) => {
                      const draft = editingMap[card.card_number];
                      const isEditing = !!draft;

                      return (
                        <tr key={card.card_number}>
                          <td>
                            {isEditing ? (
                              <input
                                className="filter-input"
                                value={draft.cardNumberDraft}
                                onChange={(e) => {
                                  const next = String(e.target.value || '').toUpperCase().slice(0, 5); // A#### max
                                  setEditingMap((prev) => ({
                                    ...prev,
                                    [card.card_number]: { ...prev[card.card_number], cardNumberDraft: next },
                                  }));
                                }}
                                placeholder="A1452"
                              />
                            ) : (
                              card.card_number
                            )}
                          </td>

                          <td>
                            {isEditing ? (
                              <select
                                className="inline-select"
                                value={draft.prize}
                                onChange={(e) => {
                                  const nextPrize = e.target.value;
                                  setEditingMap((prev) => ({
                                    ...prev,
                                    [card.card_number]: { ...prev[card.card_number], prize: nextPrize },
                                  }));
                                }}
                              >
                                {PRIZE_TYPES.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              card.prize || '-'
                            )}
                          </td>

                          <td>
                            {isEditing ? (
                              <label className="inline-check">
                                <input
                                  type="checkbox"
                                  checked={!!draft.redeemed}
                                  onChange={(e) => {
                                    const nextRedeemed = e.target.checked;
                                    setEditingMap((prev) => ({
                                      ...prev,
                                      [card.card_number]: { ...prev[card.card_number], redeemed: nextRedeemed },
                                    }));
                                  }}
                                />
                                <span>Redeemed</span>
                              </label>
                            ) : (
                              card.redeemed ? 'Yes' : 'No'
                            )}
                          </td>

                          <td>
                            {isEditing ? (
                              <div className="actions-row">
                                <button
                                  className="admin-btn"
                                  type="button"
                                  onClick={() => saveEdit(card.card_number)}
                                  disabled={loading}
                                >
                                  Save
                                </button>
                                <button
                                  className="admin-btn ghost"
                                  type="button"
                                  onClick={() => cancelEdit(card.card_number)}
                                  disabled={loading}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="actions-row">
                                <button className="admin-btn" type="button" onClick={() => startEdit(card)} disabled={loading}>
                                  Edit
                                </button>
                                <button
                                  className="admin-btn ghost"
                                  type="button"
                                  onClick={() => toggleRedeemedQuick(card.card_number, !card.redeemed)}
                                  disabled={loading}
                                >
                                  {card.redeemed ? 'Mark Pending' : 'Mark Redeemed'}
                                </button>
                                <button
                                  className="admin-btn danger"
                                  type="button"
                                  onClick={() => handleDelete(card.card_number)}
                                  disabled={loading}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeMenu === 'partners' ? (
          <section className="panel">
            <div className="panel-head">
              <h2>Partners</h2>
              <div className="panel-note">Premium multi-partner ecosystem (UI ready • backend pending)</div>
            </div>
            <div className="empty-state">
              <div className="empty-badge">Coming Soon</div>
              <p>Admin will be able to add partners, upload partner logos, and manage partner rewards.</p>
            </div>
          </section>
        ) : null}

        {activeMenu === 'settings' ? (
          <section className="panel">
            <div className="panel-head">
              <h2>Settings</h2>
              <div className="panel-note">System controls & preferences (UI ready • backend pending)</div>
            </div>
            <div className="empty-state">
              <div className="empty-badge">Coming Soon</div>
              <p>Settings will be added for future scalability.</p>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default AdminDashboard;

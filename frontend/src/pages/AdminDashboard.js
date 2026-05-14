import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css';

const PRIZE_TYPES = [
  '10% Discount',
  'Free Drink',
  '10% Discount on Drinks',
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

  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');
  const [bulkImportFormat, setBulkImportFormat] = useState('json'); // json or csv

  // Winning cards pagination
  const [cardsSearchQ, setCardsSearchQ] = useState('');
  const [cardsPage, setCardsPage] = useState(1);
  const cardsPerPage = 50;

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
    return `/api/admin/entries${qs ? `?${qs}` : ''}`;
  };

  const fetchAll = async () => {
    if (!requireLogin()) return;

    setLoading(true);
    setError('');
    try {
      const statsRes = await fetch('/api/admin/stats', { credentials: 'include' });
      const entriesRes = await fetch(buildEntriesUrl(), { credentials: 'include' });
      const cardsRes = await fetch('/api/admin/winning-cards', { credentials: 'include' });

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
    const res = await fetch('/api/admin/winning-cards', {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({ card_number: cardNumber, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to update winning card');
  };

  const deleteWinningCard = async (cardNumber) => {
    const res = await fetch('/api/admin/winning-cards', {
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
    const res = await fetch('/api/winning-cards/bulk', {
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
        partnerName: card.partner_name || 'Lambrisco Lounge',
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

    const newCardNumber = String(draft.cardNumberDraft || '').trim().toUpperCase();
    const prize = draft.prize;
    const partnerName = String(draft.partnerName || '').trim();
    const redeemed = !!draft.redeemed;

    if (!newCardNumber) {
      throw new Error('Card number is required');
    }

    if (!partnerName) {
      throw new Error('Partner name is required');
    }

    try {
      if (newCardNumber !== originalCardNumber) {
        // Card number changed: use bulk endpoint to upsert new card, then delete old
        await bulkUpsertWinningCards([
          {
            card_number: newCardNumber,
            prize,
            partner_name: partnerName,
          },
        ]);

        await deleteWinningCard(originalCardNumber);

        if (redeemed) {
          await updateWinningCard(newCardNumber, { redeemed: true });
        }
      } else {
        // Card number unchanged: patch prize/partner/redeemed
        await updateWinningCard(originalCardNumber, { prize, redeemed });
        // Note: backend PATCH doesn't support partner_name change, so we need to use bulk
        if (partnerName !== (winningCards.find(c => c.card_number === originalCardNumber)?.partner_name)) {
          await bulkUpsertWinningCards([
            {
              card_number: originalCardNumber,
              prize,
              partner_name: partnerName,
            },
          ]);
        }
      }

      await fetchAll();
      cancelEdit(originalCardNumber);
    } catch (e) {
      alert(`Save failed: ${e.message}`);
      throw e;
    }
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

  const parseBulkImport = () => {
    const text = bulkImportText.trim();
    if (!text) throw new Error('Bulk import data is empty');

    try {
      if (bulkImportFormat === 'json') {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('JSON must be an array');
        return data.map((item) => ({
          card_number: String(item.card_number || '').toUpperCase(),
          prize: item.prize || PRIZE_TYPES[0],
          partner_name: item.partner_name || 'Lambrisco Lounge',
        }));
      } else {
        // CSV: card_number,prize,partner_name
        const lines = text.split('\n').filter((l) => l.trim());
        return lines.map((line) => {
          const [cardNum, prize, partner] = line.split(',').map((s) => s.trim());
          return {
            card_number: String(cardNum || '').toUpperCase(),
            prize: prize || PRIZE_TYPES[0],
            partner_name: partner || 'Lambrisco Lounge',
          };
        });
      }
    } catch (e) {
      throw new Error(`Parse error: ${e.message}`);
    }
  };

  const handleBulkImport = async () => {
    try {
      const cards = parseBulkImport();
      if (cards.length === 0) throw new Error('No cards to import');

      setLoading(true);
      await bulkUpsertWinningCards(cards);
      await fetchAll();
      setBulkImportText('');
      setShowBulkImport(false);
      alert(`Successfully imported ${cards.length} cards`);
    } catch (e) {
      alert(`Bulk import failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const hasFilters = !!(searchQ.trim() || filterResult || filterRedeemed);

  // Filter winning cards for display
  const filteredCards = useMemo(() => {
    if (!cardsSearchQ.trim()) return winningCards;
    const q = cardsSearchQ.toLowerCase();
    return winningCards.filter(
      (card) =>
        card.card_number.toLowerCase().includes(q) ||
        (card.prize && card.prize.toLowerCase().includes(q)) ||
        (card.partner_name && card.partner_name.toLowerCase().includes(q))
    );
  }, [winningCards, cardsSearchQ]);

  const totalCardPages = Math.ceil(filteredCards.length / cardsPerPage);
  const paginatedCards = filteredCards.slice(
    (cardsPage - 1) * cardsPerPage,
    cardsPage * cardsPerPage
  );

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
              <h2>Winning Cards ({winningCards.length})</h2>
              <div className="panel-note">Edit • Mark redeemed • Delete • Bulk import</div>
            </div>

            {showBulkImport ? (
              <div className="bulk-import-box">
                <h3>Bulk Import Winning Cards</h3>
                <div className="bulk-import-controls">
                  <select
                    value={bulkImportFormat}
                    onChange={(e) => setBulkImportFormat(e.target.value)}
                    className="filter-select"
                  >
                    <option value="json">JSON Format</option>
                    <option value="csv">CSV Format (card_number,prize,partner_name)</option>
                  </select>
                </div>

                <textarea
                  className="bulk-import-textarea"
                  placeholder={
                    bulkImportFormat === 'json'
                      ? '[{"card_number":"A1452","prize":"10% Discount","partner_name":"Tasty Grill"}]'
                      : 'A1452,10% Discount,Tasty Grill\nA1457,Free Drink,Lambrisco Lounge'
                  }
                  value={bulkImportText}
                  onChange={(e) => setBulkImportText(e.target.value)}
                  rows={10}
                />

                <div className="bulk-import-actions">
                  <button
                    className="admin-btn"
                    onClick={handleBulkImport}
                    disabled={loading || !bulkImportText.trim()}
                  >
                    Import {bulkImportText.trim() ? `(${bulkImportText.split('\n').filter((l) => l.trim()).length} rows)` : ''}
                  </button>
                  <button className="admin-btn ghost" onClick={() => setShowBulkImport(false)} disabled={loading}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="bulk-import-trigger">
                <button className="admin-btn" onClick={() => setShowBulkImport(true)}>
                  Bulk Import Cards
                </button>
              </div>
            )}

            <div className="cards-filter">
              <input
                className="filter-input"
                placeholder="Search card number / prize / partner"
                value={cardsSearchQ}
                onChange={(e) => {
                  setCardsSearchQ(e.target.value);
                  setCardsPage(1);
                }}
              />
              <span className="cards-info">
                Showing {paginatedCards.length} of {filteredCards.length} cards
              </span>
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
                  {paginatedCards.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-cell">
                        {filteredCards.length === 0 ? 'No winning cards found.' : 'No results for search.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedCards.map((card) => {
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

            {totalCardPages > 1 && (
              <div className="pagination">
                <button
                  className="admin-btn"
                  disabled={cardsPage === 1 || loading}
                  onClick={() => setCardsPage(cardsPage - 1)}
                >
                  ← Prev
                </button>
                <span className="page-info">
                  Page {cardsPage} of {totalCardPages}
                </span>
                <button
                  className="admin-btn"
                  disabled={cardsPage === totalCardPages || loading}
                  onClick={() => setCardsPage(cardsPage + 1)}
                >
                  Next →
                </button>
              </div>
            )}
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

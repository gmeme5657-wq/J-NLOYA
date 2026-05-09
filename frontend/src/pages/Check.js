import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './Check.css';

const Check = () => {
  const [form, setForm] = useState({ full_name: '', phone_number: '', coupon_code: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setForm(prev => ({ ...prev, coupon_code: code }));
    }
  }, [searchParams]);

  const handleChange = (e) => {
    const name = e.target.name;
    const value = e.target.value;
    // Map form field names to API field names
    const apiName = name === 'name' ? 'full_name' : name === 'phone' ? 'phone_number' : name;
    setForm({ ...form, [apiName]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5001/api/check-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (response.ok) {
        navigate('/result', { state: data });
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Network error');
    }
  };

  return (
    <div className="check">
      <h1>Check Your Coupon</h1>
      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={form.full_name}
          onChange={handleChange}
          required
        />
        <input
          type="tel"
          name="phone"
          placeholder="Phone Number"
          value={form.phone_number}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="coupon_code"
          placeholder="Coupon Code"
          value={form.coupon_code}
          onChange={handleChange}
          required
        />
        <button type="submit" className="btn">Submit</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default Check;
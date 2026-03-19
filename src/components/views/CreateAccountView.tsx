/**
 * CreateAccountView — Create a new customer account with a primary contact.
 *
 * Three-step creation flow:
 * 1. Fill account details (name, country, reseller, address)
 * 2. Fill primary contact details (name, email, phone, title)
 * 3. Submit: creates account -> creates contact -> sets as primary contact
 *
 * Features:
 * - Duplicate detection before creation (searches by account name and email domain)
 * - Searchable country dropdown (200+ countries)
 * - Searchable reseller selector (admin/distributor) or auto-assigned (standard users)
 * - "Create Anyway" bypass if duplicates are found
 * - Viewer role users see a permission denied message
 *
 * Data: Creates via /api/accounts (POST) + /api/contacts (POST) + /api/accounts/[id] (PATCH).
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  User,
  MapPin,
  Mail,
  Phone,
  Loader2,
  Save,
  Search,
  AlertTriangle,
  ExternalLink,
  X,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia',
  'Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon','Canada',
  'Cape Verde','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica','Croatia','Cuba',
  'Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic','East Timor','Ecuador','Egypt','El Salvador',
  'Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia',
  'Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hungary','Iceland',
  'India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan','Kenya',
  'Kiribati','Kosovo','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania',
  'Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius','Mexico',
  'Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nauru','Nepal',
  'Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan',
  'Palau','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania',
  'Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino',
  'Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia',
  'Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden',
  'Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey',
  'Turkmenistan','Tuvalu','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan',
  'Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

interface ResellerOption {
  id: string;
  name: string;
  region: string;
}

interface DuplicateMatch {
  id: string;
  Account_Name: string;
  Email_Domain?: string;
  Billing_Country?: string;
  Reseller?: { name: string };
}

export default function CreateAccountView() {
  const { user, setCurrentView, setSelectedAccountId } = useAppStore();

  // Form state
  const [accountName, setAccountName] = useState('');
  const [country, setCountry] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postCode, setPostCode] = useState('');
  const [selectedReseller, setSelectedReseller] = useState('');
  const [resellerSearch, setResellerSearch] = useState('');

  // Contact
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');

  // State
  const [resellers, setResellers] = useState<ResellerOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const hasChildResellers = user?.permissions?.canViewChildRecords;
  const canPickReseller = isAdmin || hasChildResellers;
  const isViewer = user?.role === 'viewer';

  // Load resellers
  useEffect(() => {
    if (!canPickReseller) {
      // Auto-set to user's reseller
      if (user?.resellerId) setSelectedReseller(user.resellerId);
      return;
    }
    let url = '/api/resellers';
    if (!isAdmin && user?.resellerId) {
      url = `/api/resellers?resellerId=${user.resellerId}&includeChildren=true`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setResellers(data.resellers || []);
        // Auto-select user's reseller if they have one
        if (user?.resellerId && !isAdmin) {
          setSelectedReseller(user.resellerId);
        }
      })
      .catch(() => {});
  }, [canPickReseller, isAdmin, user?.resellerId]);

  const filteredResellers = useMemo(() => {
    if (!resellerSearch) return resellers;
    return resellers.filter(r => r.name.toLowerCase().includes(resellerSearch.toLowerCase()));
  }, [resellers, resellerSearch]);

  const selectedResellerName = resellers.find(r => r.id === selectedReseller)?.name || user?.resellerName || '';

  const [attempted, setAttempted] = useState(false);
  const isValid = accountName.trim() && country.trim() && selectedReseller && firstName.trim() && lastName.trim() && email.trim();

  // Check for duplicates
  const checkDuplicates = async () => {
    setCheckingDuplicates(true);
    setDuplicates([]);

    const checks: Promise<DuplicateMatch[]>[] = [];

    // Check by account name
    if (accountName.trim()) {
      checks.push(
        fetch(`/api/accounts?search=${encodeURIComponent(accountName.trim())}`)
          .then(r => r.json())
          .then(d => (d.accounts || []).slice(0, 5))
          .catch(() => [])
      );
    }

    // Check by email domain
    if (email.includes('@')) {
      const domain = email.split('@')[1];
      checks.push(
        fetch(`/api/accounts?search=${encodeURIComponent(domain)}`)
          .then(r => r.json())
          .then(d => (d.accounts || []).slice(0, 5))
          .catch(() => [])
      );
    }

    const results = await Promise.all(checks);
    const allMatches = results.flat();

    // Deduplicate by ID
    const seen = new Set<string>();
    const unique: DuplicateMatch[] = [];
    for (const m of allMatches) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        unique.push(m);
      }
    }

    setDuplicates(unique);
    setCheckingDuplicates(false);

    if (unique.length > 0) {
      setShowDuplicateWarning(true);
      return true;
    }
    return false;
  };

  const handleSave = async () => {
    setAttempted(true);
    if (!isValid) return;

    // Check duplicates first
    const hasDuplicates = await checkDuplicates();
    if (hasDuplicates) return; // Show warning, user can proceed from there

    await createAccount();
  };

  const createAccount = async () => {
    setSaving(true);
    setShowDuplicateWarning(false);

    try {
      // 1. Create account
      const accountData: Record<string, unknown> = {
        Account_Name: accountName.trim(),
        Billing_Country: country.trim(),
        Reseller: { id: selectedReseller },
      };
      if (street) accountData.Billing_Street = street;
      if (city) accountData.Billing_City = city;
      if (state) accountData.Billing_State = state;
      if (postCode) accountData.Billing_Code = postCode;

      const accRes = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData),
      });
      const accResult = await accRes.json();
      const accountId = accResult.id;

      if (!accountId) {
        setSaving(false);
        return;
      }

      // 2. Create contact with workflow triggers
      const contactData: Record<string, unknown> = {
        First_Name: firstName.trim(),
        Last_Name: lastName.trim(),
        Email: email.trim(),
        Account_Name: { id: accountId },
      };
      if (phone) contactData.Phone = phone;
      if (title) contactData.Title = title;

      const contactRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactData),
      });
      const contactResult = await contactRes.json();
      const contactId = contactResult.id;

      // 3. Set as primary contact
      if (contactId) {
        await fetch(`/api/accounts/${accountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Primary_Contact: contactId }),
        });
      }

      // Navigate to the new account
      setSelectedAccountId(accountId);
      setCurrentView('account-detail');
    } catch { /* handled */ }
    setSaving(false);
  };

  const openDuplicate = (id: string) => {
    setSelectedAccountId(id);
    setCurrentView('account-detail');
  };

  if (isViewer) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">You do not have permission to create accounts.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Create Account</h1>
            <p className="text-sm text-text-muted mt-1">Create a new customer account with a primary contact</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Creating...' : 'Create Account'}
          </button>
        </div>

        {/* Validation message */}
        {attempted && !isValid ? (
          <div className="flex items-center gap-2 text-xs text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5 mb-6">
            <AlertTriangle size={14} />
            Please fill in all required fields: Account Name, Country, Reseller, First Name, Last Name, and Email.
          </div>
        ) : null}

        {/* Duplicate Warning */}
        {showDuplicateWarning && duplicates.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-warning" />
                <span className="text-sm font-semibold text-warning">Possible duplicates found</span>
              </div>
              <button onClick={() => setShowDuplicateWarning(false)} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-2 mb-3">
              {duplicates.map(d => (
                <button
                  key={d.id}
                  onClick={() => openDuplicate(d.id)}
                  className="w-full flex items-center justify-between bg-surface border border-border-subtle rounded-lg px-3 py-2 hover:border-csa-accent/50 transition-colors cursor-pointer group"
                >
                  <div className="text-left">
                    <div className="text-sm font-semibold text-text-primary group-hover:text-csa-accent transition-colors">{d.Account_Name}</div>
                    <div className="text-xs text-text-muted">
                      {[d.Email_Domain, d.Billing_Country, d.Reseller?.name].filter(Boolean).join(' \u2022 ')}
                    </div>
                  </div>
                  <ExternalLink size={12} className="text-text-muted" />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={createAccount}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl hover:bg-warning/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Create Anyway
              </button>
              <span className="text-xs text-text-muted">or click an account above to open it</span>
            </div>
          </motion.div>
        ) : null}

        {/* Account Details */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-csa-accent" />
            Account Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Account Name *</label>
              <input
                type="text"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                placeholder="Company name"
                className={`w-full bg-surface border-2 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !accountName.trim() ? 'border-error' : 'border-border-subtle'}`}
              />
            </div>
            <div className="relative">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Country *</label>
              <input
                type="text"
                value={country ? country : countrySearch}
                onChange={e => { setCountrySearch(e.target.value); setCountry(''); setCountryOpen(true); }}
                onFocus={() => { if (country) { setCountrySearch(country); setCountry(''); } setCountryOpen(true); }}
                onBlur={() => setTimeout(() => setCountryOpen(false), 200)}
                placeholder="Search country..."
                className={`w-full bg-surface border-2 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !country.trim() ? 'border-error' : 'border-border-subtle'}`}
              />
              {countryOpen && !country && (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-csa-dark border border-border rounded-xl max-h-[200px] overflow-y-auto shadow-lg">
                  {COUNTRIES.filter(c => !countrySearch || c.toLowerCase().includes(countrySearch.toLowerCase())).slice(0, 20).map(c => (
                    <button
                      key={c}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setCountry(c); setCountrySearch(''); setCountryOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors cursor-pointer"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reseller */}
            {canPickReseller ? (
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Reseller *</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={selectedReseller ? selectedResellerName : resellerSearch}
                    onChange={e => { setResellerSearch(e.target.value); setSelectedReseller(''); }}
                    onFocus={() => { if (selectedReseller) { setResellerSearch(selectedResellerName); setSelectedReseller(''); } }}
                    placeholder="Search resellers..."
                    className={`w-full bg-surface border-2 pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !selectedReseller ? 'border-error' : 'border-border-subtle'}`}
                  />
                  {!selectedReseller && resellerSearch && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-csa-dark border border-border rounded-xl max-h-[200px] overflow-y-auto shadow-lg">
                      {filteredResellers.map(r => (
                        <button
                          key={r.id}
                          onClick={() => { setSelectedReseller(r.id); setResellerSearch(''); }}
                          className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors cursor-pointer"
                        >
                          {r.name}
                        </button>
                      ))}
                      {filteredResellers.length === 0 && (
                        <div className="px-3 py-2 text-xs text-text-muted">No resellers found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Reseller</label>
                <div className="bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-secondary rounded-xl">
                  {user?.resellerName || 'Your reseller'}
                </div>
              </div>
            )}
          </div>

          {/* Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Street</label>
              <input type="text" value={street} onChange={e => setStreet(e.target.value)} placeholder="Street address"
                className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">City</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="City"
                className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">State</label>
                <input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="State"
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Post Code</label>
                <input type="text" value={postCode} onChange={e => setPostCode(e.target.value)} placeholder="Code"
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Primary Contact */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
            <User size={16} className="text-csa-accent" />
            Primary Contact
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">First Name *</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name"
                className={`w-full bg-surface border-2 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !firstName.trim() ? 'border-error' : 'border-border-subtle'}`} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Last Name *</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name"
                className={`w-full bg-surface border-2 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !lastName.trim() ? 'border-error' : 'border-border-subtle'}`} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Email *</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com"
                  className={`w-full bg-surface border-2 pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !email.trim() ? 'border-error' : 'border-border-subtle'}`} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Phone</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number"
                  className="w-full bg-surface border-2 border-border-subtle pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Job title"
                className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

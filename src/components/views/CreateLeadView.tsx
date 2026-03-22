/**
 * CreateLeadView — Create a new lead in Zoho CRM.
 *
 * Single-form layout with fields matching the Zoho Leads module.
 * Admin/IBM users can select a reseller; other users auto-assign to their own.
 * Duplicate detection by email before creation.
 *
 * Data: Creates via POST /api/leads.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Save,
  Search,
  AlertTriangle,
  ExternalLink,
  Briefcase,
  Globe,
  ChevronDown,
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

const LEAD_STATUSES = [
  'Not Contacted', 'Attempted to Contact', 'Contacted', 'Future Interest',
  'Pre-Qualified', 'Suspect',
];

const PRODUCT_INTERESTS = [
  'Civil Site Design for BricsCAD',
  'Civil Site Design for Civil 3D',
  'Corridor EZ for Civil 3D',
  'Stringer Topo for BricsCAD',
  'Stringer Topo for Civil 3D',
  'Customization/Design/Training Services',
  'Software Maintenance Plan',
];

const INDUSTRIES = [
  'Civil Engineering', 'Utilities', 'Academic', 'Builder', 'Developer',
  'Government', 'Mining', 'Survey', 'Other',
];

const LEAD_SOURCES = [
  'Website', 'Referral', 'Trade Show', 'Cold Call', 'Email Campaign',
  'Social Media', 'Partner', 'Other',
];

interface ResellerOption {
  id: string;
  name: string;
  region: string;
}

const inputCls = "w-full bg-csa-dark border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg";
const selectCls = "w-full bg-csa-dark border border-border-subtle px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-lg appearance-none cursor-pointer pr-8";
const labelCls = "text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block";

export default function CreateLeadView() {
  const { user, setCurrentView, setSelectedLeadId, setSelectedLeadSource } = useAppStore();

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [leadStatus, setLeadStatus] = useState('Not Contacted');
  const [productInterest, setProductInterest] = useState('');
  const [industry, setIndustry] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [description, setDescription] = useState('');
  const [selectedReseller, setSelectedReseller] = useState('');
  const [resellerSearch, setResellerSearch] = useState('');

  // State
  const [resellers, setResellers] = useState<ResellerOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const canSelectReseller = isAdmin || user?.permissions?.canViewChildRecords;

  // Load resellers for selector
  useEffect(() => {
    if (!canSelectReseller) return;
    let url = '/api/resellers';
    if (!isAdmin && user?.resellerId) url = `/api/resellers?resellerId=${user.resellerId}&includeChildren=true`;
    fetch(url).then(r => r.json()).then(d => setResellers(d.resellers || [])).catch(() => {});
  }, [isAdmin, canSelectReseller, user?.resellerId]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRIES;
    const q = countrySearch.toLowerCase();
    return COUNTRIES.filter(c => c.toLowerCase().includes(q));
  }, [countrySearch]);

  const filteredResellers = useMemo(() => {
    if (!resellerSearch) return resellers;
    const q = resellerSearch.toLowerCase();
    return resellers.filter(r => r.name.toLowerCase().includes(q));
  }, [resellers, resellerSearch]);

  const selectedResellerName = resellers.find(r => r.id === selectedReseller)?.name;

  const canSubmit = lastName.trim() && company.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');

    try {
      const body: Record<string, string> = {
        Last_Name: lastName.trim(),
        Company: company.trim(),
        Lead_Status: leadStatus,
      };
      if (firstName.trim()) body.First_Name = firstName.trim();
      if (email.trim()) body.Email = email.trim();
      if (phone.trim()) body.Phone = phone.trim();
      if (mobile.trim()) body.Mobile = mobile.trim();
      if (jobTitle.trim()) body.Job_Title3 = jobTitle.trim();
      if (website.trim()) body.Website = website.trim();
      if (country) body.Country = country;
      if (productInterest) body.Product_Interest = productInterest;
      if (industry) body.Industry = industry;
      if (leadSource) body.Lead_Source = leadSource;
      if (description.trim()) body.Description = description.trim();

      const payload: Record<string, unknown> = { ...body };
      if (canSelectReseller && selectedReseller) {
        payload.Reseller = selectedReseller;
      }

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.id) {
        setSelectedLeadId(data.id);
        setSelectedLeadSource('lead');
        setCurrentView('lead-detail');
      } else if (data.error) {
        setError(data.error);
      } else {
        setError('Failed to create lead');
      }
    } catch {
      setError('Failed to create lead');
    }
    setSaving(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-text-primary mb-6">Create Lead</h1>

          {/* Contact Information */}
          <div className="bg-surface border border-border-subtle rounded-xl p-5 mb-5">
            <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
              <User size={15} className="text-csa-accent" /> Contact Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First Name</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Last Name *</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" className={`${inputCls} pl-9`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" className={`${inputCls} pl-9`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Mobile</label>
                <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Mobile number" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Job Title</label>
                <div className="relative">
                  <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Job title" className={`${inputCls} pl-9`} />
                </div>
              </div>
            </div>
          </div>

          {/* Company Details */}
          <div className="bg-surface border border-border-subtle rounded-xl p-5 mb-5">
            <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
              <Building2 size={15} className="text-csa-accent" /> Company Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className={labelCls}>Company Name *</label>
                <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Website</label>
                <div className="relative">
                  <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="text" value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.example.com" className={`${inputCls} pl-9`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Industry</label>
                <div className="relative">
                  <select value={industry} onChange={e => setIndustry(e.target.value)} className={selectCls}>
                    <option value="">Select industry...</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              {/* Country with search dropdown */}
              <div className="relative">
                <label className={labelCls}>Country</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={country || countrySearch}
                    onChange={e => { setCountrySearch(e.target.value); setCountry(''); setCountryOpen(true); }}
                    onFocus={() => { if (country) { setCountrySearch(country); setCountry(''); } setCountryOpen(true); }}
                    onBlur={() => setTimeout(() => setCountryOpen(false), 200)}
                    placeholder="Search countries..."
                    className={`${inputCls} pl-9`}
                  />
                </div>
                {countryOpen && filteredCountries.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-csa-dark border border-border rounded-xl max-h-[200px] overflow-y-auto shadow-lg">
                    {filteredCountries.slice(0, 30).map(c => (
                      <button key={c} onMouseDown={() => { setCountry(c); setCountrySearch(''); setCountryOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors cursor-pointer">{c}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lead Details */}
          <div className="bg-surface border border-border-subtle rounded-xl p-5 mb-5">
            <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
              <Search size={15} className="text-csa-accent" /> Lead Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Lead Status</label>
                <div className="relative">
                  <select value={leadStatus} onChange={e => setLeadStatus(e.target.value)} className={selectCls}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Product Interest</label>
                <div className="relative">
                  <select value={productInterest} onChange={e => setProductInterest(e.target.value)} className={selectCls}>
                    <option value="">Select product...</option>
                    {PRODUCT_INTERESTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Lead Source</label>
                <div className="relative">
                  <select value={leadSource} onChange={e => setLeadSource(e.target.value)} className={selectCls}>
                    <option value="">Select source...</option>
                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              {/* Reseller selector */}
              {canSelectReseller ? (
                <div className="relative">
                  <label className={labelCls}>Reseller</label>
                  <input
                    type="text"
                    value={selectedResellerName || resellerSearch}
                    onChange={e => { setResellerSearch(e.target.value); setSelectedReseller(''); }}
                    onFocus={() => { if (selectedReseller) { setResellerSearch(selectedResellerName || ''); setSelectedReseller(''); } }}
                    placeholder="Search resellers..."
                    className={inputCls}
                  />
                  {!selectedReseller && resellerSearch && filteredResellers.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-csa-dark border border-border rounded-xl max-h-[200px] overflow-y-auto shadow-lg">
                      {filteredResellers.map(r => (
                        <button key={r.id} onMouseDown={() => { setSelectedReseller(r.id); setResellerSearch(''); }}
                          className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors cursor-pointer">{r.name}</button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Reseller</label>
                  <input type="text" value={user?.resellerName || 'Auto-assigned'} disabled className={`${inputCls} opacity-60`} />
                </div>
              )}
              <div className="md:col-span-2">
                <label className={labelCls}>Notes / Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="Additional notes about this lead..." className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 p-3 bg-error/10 border border-error/30 rounded-xl flex items-center gap-2 text-sm text-error">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('leads')}
              className="px-4 py-2.5 text-sm font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl hover:text-text-primary transition-colors cursor-pointer">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving || !canSubmit}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Create Lead
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

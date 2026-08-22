'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useMyAlumniProfile, useAlumni, useActiveCampaigns, useAllCampaigns,
  useCampaign, useDonateToCampaign, useUpdateAlumniProfile,
} from '@/hooks/use-alumni';
import { useAuthStore } from '@/stores/auth.store';
import { hasEffectiveRole, hasEffectiveScope } from '@/lib/authz';
import { cn, formatDate } from '@/lib/utils';
import type { CampaignV1 } from '@uniportal/types';

const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'badge-success', DRAFT: 'badge-warning',
  COMPLETED: 'badge-info', CANCELLED: 'badge-neutral',
};

type Tab = 'campaigns' | 'profile' | 'directory';

export default function AlumniPage() {
  const user    = useAuthStore((s) => s.user);
  const isAdmin = hasEffectiveRole(user, 'VC', 'SUPER_ADMIN');
  const isStaff = hasEffectiveScope(user, 'alumni');

  const [tab, setTab]               = useState<Tab>('campaigns');
  const [selectedCampaign, setSelC] = useState<string | null>(null);
  const [donateAmount, setAmount]   = useState('');
  const [donorName, setDonorName]   = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [message, setMessage]       = useState('');
  const [isAnon, setIsAnon]         = useState(false);
  const [profileEdit, setEdit]      = useState(false);
  const [profileFields, setProfile] = useState({
    occupation: '', employer: '', industry: '',
    linkedinUrl: '', currentCountry: '', currentCity: '', bio: '',
  });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const { data: myProfile }           = useMyAlumniProfile();
  const { data: campaigns = [] }      = useActiveCampaigns();
  const { data: allCampaigns = [] }   = useAllCampaigns();
  const { data: alumniDir }           = useAlumni();
  const { data: campaignDetail }      = useCampaign(selectedCampaign);

  const { mutate: donate,  isPending: donating }   = useDonateToCampaign();
  const { mutate: updateProfile, isPending: saving } = useUpdateAlumniProfile();

  const displayCampaigns: CampaignV1[] = (isAdmin || isStaff) ? allCampaigns : campaigns;

  const handleDonate = () => {
    if (!selectedCampaign || !donateAmount) {
      setErr('Please enter a donation amount'); return;
    }
    setErr(''); setMsg('');
    donate(
      {
        campaignId:  selectedCampaign,
        alumniId:    myProfile?.id,
        amount:      donateAmount,
        isAnonymous: isAnon,
        donorName:   isAnon ? undefined : (donorName || `${user?.email ?? 'Donor'}`),
        donorEmail:  donorEmail || undefined,
        message:     message || undefined,
      },
      {
        onSuccess: (r) => {
          setMsg(`✓ ${r.message}`);
          setAmount(''); setMessage(''); setDonorName(''); setDonorEmail('');
        },
        onError: (e) => setErr(e.message),
      },
    );
  };

  const handleSaveProfile = () => {
    if (!myProfile?.id) return;
    setErr(''); setMsg('');
    updateProfile(
      { id: myProfile.id, ...profileFields },
      {
        onSuccess: () => { setMsg('✓ Profile updated'); setEdit(false); },
        onError:   (e) => setErr(e.message),
      },
    );
  };

  const alumni = alumniDir?.alumni ?? [];

  const tabs: { k: Tab; l: string }[] = [
    { k: 'campaigns', l: `Campaigns (${displayCampaigns.length})` },
    { k: 'profile',   l: 'My Profile' },
    ...(isAdmin || isStaff ? [{ k: 'directory' as Tab, l: `Alumni Directory (${alumni.length})` }] : []),
  ];

  return (
    <div className="erp-workspace-page">
      {/* Header */}
      <div className="erp-workspace-header flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Alumni & Endowment</h2>
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button type="button" key={t.k} onClick={() => { setTab(t.k); setSelC(null); setErr(''); setMsg(''); }}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.k ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}
      {msg && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}

      {/* ── Campaigns ────────────────────────────────────────────────────── */}
      {tab === 'campaigns' && !selectedCampaign && (
        <div className="space-y-3">
          {displayCampaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active fundraising campaigns at the moment.</p>
          ) : (
            displayCampaigns.map((c) => {
              const pct = Math.min(100, (parseFloat(c.raisedAmount) / parseFloat(c.targetAmount)) * 100);
              return (
                <Card key={c.id}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
                            CAMPAIGN_STATUS_COLORS[c.status] ?? 'badge-neutral')}>
                            {c.status}
                          </span>
                          <h3 className="text-sm font-semibold text-foreground">{c.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                        {c.endDate && (
                          <p className="text-xs text-muted-foreground">Ends: {formatDate(c.endDate)}</p>
                        )}
                      </div>
                      {c.status === 'ACTIVE' && (
                        <Button size="sm" onClick={() => setSelC(c.id)}>Donate</Button>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>₦{parseFloat(c.raisedAmount).toLocaleString()} raised</span>
                        <span>Goal: ₦{parseFloat(c.targetAmount).toLocaleString()}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-[--color-accent] transition-all"
                          style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pct.toFixed(1)}% funded · {c._count?.donations ?? 0} donor(s)
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── Donate flow ──────────────────────────────────────────────────── */}
      {tab === 'campaigns' && selectedCampaign && (
        <div className="space-y-4">
          <Button size="sm" variant="ghost" onClick={() => setSelC(null)}>← Back to Campaigns</Button>

          {campaignDetail && (
            <Card>
              <CardHeader>
                <CardTitle>{campaignDetail.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{campaignDetail.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>₦{parseFloat(campaignDetail.raisedAmount).toLocaleString()} raised</span>
                    <span>Goal: ₦{parseFloat(campaignDetail.targetAmount).toLocaleString()}</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-[--color-accent]"
                      style={{ width: `${Math.min(100, (parseFloat(campaignDetail.raisedAmount) / parseFloat(campaignDetail.targetAmount)) * 100)}%` }} />
                  </div>
                </div>

                {/* Donation form */}
                <div className="rounded-md border border-border p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">Make a Donation</p>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Amount (₦) *</label>
                    <Input type="number" min={100} placeholder="e.g. 5000"
                      value={donateAmount} onChange={(e) => setAmount(e.target.value)} />
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="anon" checked={isAnon}
                      onChange={(e) => setIsAnon(e.target.checked)}
                      className="rounded border-input" />
                    <label htmlFor="anon" className="text-xs text-muted-foreground">
                      Make this donation anonymous (your name won't appear on public donor list)
                    </label>
                  </div>

                  {!isAnon && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Display Name (optional)</label>
                      <Input placeholder="How your name should appear"
                        value={donorName} onChange={(e) => setDonorName(e.target.value)} />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Email for receipt (optional)</label>
                    <Input type="email" placeholder="receipt@example.com"
                      value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Message (optional)</label>
                    <textarea rows={2} placeholder="Leave a message of support…"
                      value={message} onChange={(e) => setMessage(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </div>

                  <Button className="w-full" loading={donating} onClick={handleDonate}
                    disabled={!donateAmount || parseFloat(donateAmount) < 100}>
                    Donate ₦{donateAmount ? parseFloat(donateAmount).toLocaleString() : '—'}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    You will be redirected to the payment gateway to complete your donation.
                  </p>
                </div>

                {/* Donor list (non-anonymous only) */}
                {campaignDetail.donations && campaignDetail.donations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                      Recent Donors ({campaignDetail.donations.length})
                    </p>
                    <div className="space-y-1">
                      {campaignDetail.donations.slice(0, 10).map((d) => (
                        <div key={d.id} className="flex justify-between text-xs text-muted-foreground">
                          <span>{d.isAnonymous ? '🙈 Anonymous' : (d.donorName ?? 'Donor')}</span>
                          <span className="font-medium">₦{parseFloat(String(d.amount)).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── My Profile ───────────────────────────────────────────────────── */}
      {tab === 'profile' && (
        <div className="space-y-4">
          {!myProfile ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Your alumni profile is created automatically when you graduate.
              If you believe this is an error, contact the Registrar's office.
            </div>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Alumni Profile</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {myProfile.programme} · Class of {myProfile.graduationYear}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {myProfile.classAwarded}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
                      CGPA: {myProfile.cgpaAtGrad}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!profileEdit ? (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                      {[
                        ['Occupation',    myProfile.occupation],
                        ['Employer',      myProfile.employer],
                        ['Industry',      myProfile.industry],
                        ['Location',      [myProfile.currentCity, myProfile.currentCountry].filter(Boolean).join(', ')],
                        ['LinkedIn',      myProfile.linkedinUrl],
                      ].map(([label, val]) => (
                        <div key={label as string}>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-foreground">{val || <span className="text-muted-foreground italic">Not set</span>}</p>
                        </div>
                      ))}
                    </div>
                    {myProfile.bio && (
                      <div>
                        <p className="text-xs text-muted-foreground">Bio</p>
                        <p className="text-sm text-foreground">{myProfile.bio}</p>
                      </div>
                    )}
                    <Button size="sm" onClick={() => {
                      setEdit(true);
                      setProfile({
                        occupation:     myProfile.occupation     ?? '',
                        employer:       myProfile.employer       ?? '',
                        industry:       myProfile.industry       ?? '',
                        linkedinUrl:    myProfile.linkedinUrl    ?? '',
                        currentCountry: myProfile.currentCountry ?? '',
                        currentCity:    myProfile.currentCity    ?? '',
                        bio:            myProfile.bio            ?? '',
                      });
                    }}>
                      Edit Profile
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    {([
                      { key: 'occupation',     label: 'Occupation',     placeholder: 'e.g. Software Engineer' },
                      { key: 'employer',       label: 'Employer',       placeholder: 'Company / Organisation' },
                      { key: 'industry',       label: 'Industry',       placeholder: 'e.g. Technology, Finance' },
                      { key: 'linkedinUrl',    label: 'LinkedIn URL',   placeholder: 'https://linkedin.com/in/...' },
                      { key: 'currentCountry', label: 'Country',        placeholder: 'e.g. Nigeria' },
                      { key: 'currentCity',    label: 'City',           placeholder: 'e.g. Lagos' },
                    ] as { key: keyof typeof profileFields; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <label className="text-xs text-muted-foreground">{label}</label>
                        <Input placeholder={placeholder}
                          value={profileFields[key]}
                          onChange={(e) => setProfile({ ...profileFields, [key]: e.target.value })} />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Bio</label>
                      <textarea rows={3}
                        value={profileFields.bio}
                        onChange={(e) => setProfile({ ...profileFields, bio: e.target.value })}
                        placeholder="Brief professional summary…"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" loading={saving} onClick={handleSaveProfile}>Save Changes</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Alumni Directory (Staff/Admin) ──────────────────────────────── */}
      {tab === 'directory' && (isAdmin || isStaff) && (
        <div className="space-y-3">
          {alumni.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alumni profiles found.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {['Year', 'Programme', 'Class', 'CGPA', 'Occupation', 'Employer', 'Location'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {alumni.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs text-[--color-primary]">{a.graduationYear}</td>
                      <td className="px-3 py-2 text-xs">{a.programme}</td>
                      <td className="px-3 py-2 text-xs">{a.classAwarded}</td>
                      <td className="px-3 py-2 font-mono text-xs">{a.cgpaAtGrad}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{a.occupation ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{a.employer ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {[a.currentCity, a.currentCountry].filter(Boolean).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

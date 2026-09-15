'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, Radar, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../../../../lib/api';

interface AcceptInvitationResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  organization: {
    id: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
  };
}

export default function AcceptInvitationPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [hasReadToken, setHasReadToken] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
    setHasReadToken(true);
  }, []);

  const handleAccept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await apiRequest<AcceptInvitationResponse>('/organizations/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fullName: fullName.trim(), password }),
      });
      router.replace('/dashboard');
      router.refresh();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'The invitation could not be accepted.',
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between bg-[#173e48] p-12 xl:p-16 text-white">
        <div className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <Radar size={28} aria-hidden="true" />
          RenewalRadar
        </div>
        <div className="max-w-md">
          <p className="text-xs uppercase tracking-[.18em] text-[#b8d2d6]">Join your workspace</p>
          <h1 className="mt-5 text-[44px] leading-[1.16] font-medium tracking-tight">
            One team.
            <br />
            <span className="text-[#b8d2d6]">Every deadline in view.</span>
          </h1>
          <p className="mt-6 text-base leading-7 text-[#c6d9dc]">
            Accept your invitation to join the organization and start working with its contracts,
            obligations, and alerts.
          </p>
          <div className="mt-10 space-y-5 border-t border-white/20 pt-7 text-sm text-[#d9e6e8]">
            <p className="flex gap-3 items-center">
              <UserRoundCheck size={19} aria-hidden="true" />
              Access is assigned by your organization administrator
            </p>
            <p className="flex gap-3 items-center">
              <ShieldCheck size={19} aria-hidden="true" />
              Invitation links are single-use and expire after seven days
            </p>
          </div>
        </div>
        <p className="text-xs text-[#b8d2d6]">Business obligation monitoring</p>
      </section>

      <section className="flex min-h-screen flex-col justify-center bg-white px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-12 flex items-center gap-2 text-lg font-semibold text-[#173e48] lg:hidden">
            <Radar size={26} aria-hidden="true" />
            RenewalRadar
          </div>
          <p className="text-xs font-medium uppercase tracking-[.14em] text-slate-500">
            Team invitation
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Create your account
          </h2>
          <p className="mt-3 mb-8 text-sm leading-6 text-slate-600">
            Enter your name and choose a password to accept this invitation.
          </p>

          {hasReadToken && !token ? (
            <div className="feedback-error" role="alert">
              This invitation link is missing its token. Ask your organization administrator for a
              new link.
            </div>
          ) : (
            <>
              {errorMessage && (
                <div role="alert" id="invite-error" className="feedback-error mb-5">
                  {errorMessage}
                </div>
              )}
              <form
                onSubmit={handleAccept}
                className="space-y-5"
                aria-describedby={errorMessage ? 'invite-error' : undefined}
              >
                <div>
                  <label htmlFor="fullName" className="field-label">
                    Full name
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    autoComplete="name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={255}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your name"
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="field-label">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    autoComplete="new-password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    className="field"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!token || isSubmitting}
                  className="btn btn-primary w-full !mt-7"
                >
                  {isSubmitting ? 'Accepting invitation…' : 'Accept invitation'}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

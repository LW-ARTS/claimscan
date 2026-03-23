# DPA (Data Processing Addendum) Audit Trail

> ClaimScan Sub-Processor DPA Compliance Record
> Last reviewed: March 22, 2026

## Summary

ClaimScan's Privacy Policy (§12 at claimscan.tech/terms) declares reliance on Standard Contractual Clauses (SCCs) for international data transfers. This document records the DPA status for each sub-processor listed in the Privacy Policy.

## Sub-Processor DPA Status

### 1. Vercel (Hosting & Analytics)

- **DPA URL**: https://vercel.com/legal/dpa
- **Version**: Last Updated March 17, 2026 | Effective March 31, 2026
- **Auto-Incorporated into TOS**: Yes — DPA forms part of the Terms of Service
- **SCCs Included**: Yes — Schedule 3 (Cross-Border Transfer Mechanisms)
- **Status**: ✅ COVERED — No separate acceptance required
- **Notes**: DPA accepted automatically upon account creation. SCCs use EU Commission approved version (June 2021).

### 2. Sentry (Error Monitoring)

- **DPA URL**: https://sentry.io/legal/dpa/
- **Version**: v5.1.0, May 29, 2024
- **Auto-Incorporated into TOS**: Yes — DPA incorporated into existing agreement
- **SCCs Included**: Yes — Schedule 3 (Cross-Border Transfer Mechanisms)
- **Status**: ✅ COVERED — No separate acceptance required
- **Notes**: Sentry also offers a separately executable DPA at https://sentry.io/legal/dpa/ if formal countersignature is desired.

### 3. Cloudflare (Security & Performance)

- **DPA URL**: https://www.cloudflare.com/cloudflare-customer-dpa/
- **Version**: v6.3, effective June 20, 2025
- **Auto-Incorporated into TOS**: Yes — DPA forms part of the Main Agreement from DPA Effective Date
- **SCCs Included**: Yes — Includes Data Privacy Framework, Standard Contractual Clauses, and supplementary transfer safeguards
- **Status**: ✅ COVERED — No separate acceptance required
- **Notes**: Cloudflare participates in the EU-U.S. Data Privacy Framework, providing additional transfer protections beyond SCCs.

### 4. Supabase (Database)

- **DPA URL**: https://supabase.com/legal/dpa
- **DPA PDF**: https://supabase.com/downloads/docs/Supabase+DPA+260317.pdf (v2026-03-17)
- **Auto-Incorporated into TOS**: ⚠️ NO — Requires separate signature via PandaDoc
- **SCCs Included**: TBD (verify after requesting DPA document)
- **TIA Available**: Yes — downloadable from dashboard (Transfer Impact Assessment)
- **Dashboard URL**: https://supabase.com/dashboard/org/sypcfbtqomgwntjdqeop/documents
- **Available on Free Plan**: ✅ YES — "All organizations can sign our DPA"
- **Status**: ⏳ ACTION REQUIRED — Click "Request DPA" button
- **Action Steps**:
  1. Go to dashboard → Settings → Compliance → Legal Documents (direct URL above)
  2. Click **"Request DPA"** button → opens PandaDoc flow
  3. Review DPA terms, verify SCCs are included
  4. Sign electronically via PandaDoc
  5. Download TIA document as well (for GDPR Art. 46 compliance)
  6. Save signed copy to this directory as `supabase-dpa-signed.pdf`
  7. Update this record with version date and SCC confirmation

### 5. Upstash (Redis Caching)

- **DPA URL**: https://upstash.com/trust/dpa (PDF available at /trust/dpa.pdf)
- **Version**: Not publicly versioned on website
- **Auto-Incorporated into TOS**: ⚠️ UNCLEAR — DPA available as downloadable document
- **SCCs Included**: Unknown (PDF document not publicly parsed)
- **Status**: ⏳ ACTION REQUIRED
- **Action Steps**:
  1. Download DPA from https://upstash.com/trust/dpa.pdf
  2. Review terms, verify SCC inclusion
  3. Contact support@upstash.com to confirm whether DPA is auto-incorporated into TOS or requires countersignature
  4. If countersignature required: sign and return
  5. Save confirmation/signed copy to this directory as `upstash-dpa-signed.pdf`
  6. Update this record with version date and SCC confirmation

## Compliance Checklist

- [x] Vercel DPA active with SCCs
- [x] Sentry DPA active with SCCs
- [x] Cloudflare DPA active with SCCs
- [ ] Supabase DPA — request and sign via dashboard
- [ ] Upstash DPA — verify incorporation status and sign if needed
- [ ] Save signed copies to `/docs/` directory
- [ ] Update Privacy Policy (§12) if sub-processor list changes

## Next Review

- **Date**: June 22, 2026 (quarterly)
- **Trigger for earlier review**: Any sub-processor change, new provider onboarded, or regulatory update affecting international transfers

## Contact

- **Data Protection Contact**: dpo@claimscan.tech
- **Responsible**: LW (LW ARTS)

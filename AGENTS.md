<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Reservation business rules (admin assigns the space at approval, past-date block, faculty whitelist, overlap exclusion constraint, 19:00 limit, external-exit form, per-reservation chat RLS) live in database functions/triggers and are called via RPC; keep the UI thin so rules cannot be bypassed.
- App UI is split into routes under src/routes/_authenticated (sidebar shell in its route.tsx); "/" is the sign-in page. Admin pages wrap content in SoloAdmin, but access is enforced by RLS/RPCs, not the UI.

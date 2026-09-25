# CRM Telephony – Frontend

- `core/telephony/telephony.service.ts` – polls `GET telephony/agents/me` every 3 s while logged in (this is also the presence heartbeat). Exposes `ringingCall`, `activeCall` and `pendingDisposition` signals, plus dial/answer/reject/hangup/hold/resume/transfer.
- `features/call-center/telephony-dock` (with `incoming-call/` and `active-call/`) – mounted in `layout.html`. Shows the presence pill for telecallers, the incoming-call popup with the caller card, the live call bar (timer, hold, transfer, notes, hang up), and opens the outcome form after a call.
- `features/call-center/call-disposition` – Follow-up (date/time, general/cool/hot), Appointment (date/time/counselor), Converted, Call back, and other outcomes. For an unknown caller it can create the lead first.
- Lead Management → the **Call** row action runs `dial({ lead_id })`. The list is filtered on the server (telecallers see only their assigned leads) and reloads after an outcome is saved.
- `/app/call-center` (dashboard, history, missed, telecallers) – call history, 30-day report stats, branch alerts (read / resolve / call back), and the telecaller board.

To switch the poll to realtime, subscribe with Laravel Echo to `private-telecaller.{id}` (`call.ringing`, `call.answered`, `call.ended`, `agent.status.changed`) and call `telephony.refresh()` on each event.

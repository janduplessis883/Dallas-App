# Dallas accountability connections

## Glossary

- **Buddy invitation**: a request from one Dallas user to form an in-app accountability buddy connection. It is addressed to a specific recipient and starts as `pending`.
- **Pending invitation**: an invitation awaiting the recipient's decision. It appears only in the recipient's Check-in page, beneath the Add a Buddy toggle.
- **Active buddy connection**: a mutually accepted in-app relationship. Both people can see one another as a Dallas App Buddy and exchange in-app messages.
- **Declined invitation**: a pending invitation rejected by its recipient. A future invitation may be sent according to the re-invitation policy.
- **Cancelled invitation**: a pending invitation withdrawn by its sender before the recipient responds.
- **Blocked connection**: a relationship blocked by one participant. Blocking prevents both messaging and new invitations until the blocker explicitly unblocks.
- **Blocked buddies toggle**: a Profile-page control, immediately before account deletion, that lets the blocker review and unblock blocked buddies.
- **Disconnected buddy connection**: an active connection ended by either participant. Disconnecting deletes both users' buddy records and all shared chat and check-in history.
- **Reconnection**: a new invitation following a disconnect. It always requires recipient acceptance again.
- **Invitation indicator**: the red marker on the bottom-navigation Check-in link that signals one or more pending incoming invitations.
- **Invitation notification**: a push notification sent to the recipient when a new buddy invitation is created, in addition to the in-app invitation indicator.
- **Missed planned check-in**: a planned check-in that reaches ten minutes after its scheduled time without a recorded final outcome. It is distinct from a deliberately skipped check-in.
- **Past check-in**: a completed or missed check-in displayed after active planned check-ins for a buddy.
- **Check-in Planning**: the planning area for selecting buddies and scheduling future check-ins. It is distinct from recovery reminder settings.
- **Incoming planned check-in notice**: a pre-warning shown to a Dallas buddy when another Dallas user schedules a future check-in with them.

## Lifecycle rules

- The sender may cancel a pending invitation before it is accepted, declined, or blocked.
- A declined invitation is retained as a declined record rather than deleted.
- A new invitation for the same recipient may not be created until seven days after the previous invitation was declined.
- Either participant in an active buddy connection may block the other participant.
- During the post-decline cooldown, the sender sees the date on which they may invite again rather than a decline notification.
- A planned check-in is automatically marked missed ten minutes after its scheduled time if no final outcome has been recorded.
- When a buddy's Check-in submenu loads, overdue planned check-ins are recorded as missed and appear in Past check-ins.
- Past check-ins remain stored but are shown in the app only for the most recent fourteen days, with at most ten entries per buddy.
- Planned check-ins do not support rescheduling or a declined outcome.

## Messaging moderation

- Dallas App Buddy messages and external check-in replies use the same server-side prohibited-content filter before insertion.
- Users may report only received messages; reports are private, emailed to `hello@attribut.me`, and retained in Dallas for up to twelve months.
- Reporting does not automatically block a sender, remove content, or suspend an account.
- Moderators can review or resolve reports, soft-remove and restore the associated message, and suspend or reinstate Dallas accounts. External check-in partners do not have Dallas accounts to suspend.
- A message removed by moderation appears to conversation participants as a neutral removal notice; the original remains only in the private report snapshot during its retention period.
- Only a direct database update to `profiles.user_role` can grant the admin role. The mobile navigation hides Moderation from non-admins, and each moderation request verifies the persisted role server-side.

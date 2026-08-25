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

## Lifecycle rules

- The sender may cancel a pending invitation before it is accepted, declined, or blocked.
- A declined invitation is retained as a declined record rather than deleted.
- A new invitation for the same recipient may not be created until seven days after the previous invitation was declined.
- Either participant in an active buddy connection may block the other participant.
- During the post-decline cooldown, the sender sees the date on which they may invite again rather than a decline notification.

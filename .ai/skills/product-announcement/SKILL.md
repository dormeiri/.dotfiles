---
name: product-announcement
description: Draft a product announcement for Port and save it as a Slack draft in #announcements-product. Use when the user wants to announce a feature, release, or product change.
disable-model-invocation: true
---

## Load the announcement skill

The instructions live in Port as the `product-announcement` skill entity.

With Port MCP, load the skill `product-announcement`.

If Port MCP is not available, use Port CLI:

`port api entities get skill product-announcement | jq -r '.properties.instructions'`

The entity's `references` property holds example announcements. Read them when the instructions point to them:

`port api entities get skill product-announcement | jq -r '.properties.references[] | "## \(.path)\n\n\(.content)\n"'`

Entity: https://app.getport.io/org_ukrSy0JXDGngBGUH/skillEntity?identifier=product-announcement

## Write the announcement

Follow the loaded instructions to write the announcement.

## Draft in Slack

Once the user confirms the announcement is ready, if Slack MCP is available, use `slack_send_message_draft` to draft the message in `#announcements-product` (channel ID `C067Z2CJ0H0`, https://getport.slack.com/archives/C067Z2CJ0H0). Never send it, only draft.

`slack_send_message_draft` takes standard markdown, not Slack mrkdwn. Convert the Slack-style `*bold*` from the instructions to `**bold**`, or it renders as italic. Keep emoji codes like `:tada:` as they are.

If the tool returns `draft_already_exists`, tell the user to send or delete the existing draft in the channel, then retry. If it returns `not_in_channel`, tell the user to join the channel.

If Slack MCP is not available, show the announcement to the user to copy.

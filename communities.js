/* =====================================================
   FREE CHAT — COMMUNITIES SYSTEM
   Requires supabase.js to load before this file.
   ===================================================== */

(() => {
  'use strict';

  // All 36 Nigerian states and the FCT.
  const STATES = [
    'Abia',
    'Adamawa',
    'Akwa Ibom',
    'Anambra',
    'Bauchi',
    'Bayelsa',
    'Benue',
    'Borno',
    'Cross River',
    'Delta',
    'Ebonyi',
    'Edo',
    'Ekiti',
    'Enugu',
    'Gombe',
    'Imo',
    'Jigawa',
    'Kaduna',
    'Kano',
    'Katsina',
    'Kebbi',
    'Kogi',
    'Kwara',
    'Lagos',
    'Nasarawa',
    'Niger',
    'Ogun',
    'Ondo',
    'Osun',
    'Oyo',
    'Plateau',
    'Rivers',
    'Sokoto',
    'Taraba',
    'Yobe',
    'Zamfara',
    'Federal Capital Territory (FCT)'
  ];

  // Official state communities are owned by the FREE CHAT account Freeguy.
  // Keep this ID in sync with the Supabase migration file.
  const STATE_COMMUNITY_OWNER_ID = '90ee930f-ebc5-444b-83e2-8e15de8845d6';

  const $ = id => document.getElementById(id);

  let category = 'all';
  let communities = [];
  let user = null;
  let myMemberships = new Set();
  let wired = false;
  let loading = false;

  const db = () => window.supabaseClient || null;

  // Safely display database text in HTML.
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  // Get the currently signed-in user.
  async function getUser() {
    if (!db()) return null;

    try {
      const { data, error } = await db().auth.getUser();

      if (error) {
        console.warn('[Communities] Authentication:', error.message);
        user = null;
      } else {
        user = data?.user || null;
      }
    } catch (error) {
      console.error('[Communities] Could not get user:', error);
      user = null;
    }

    return user;
  }

  // Show messages in the create-community form.
  function notice(message, isError = false) {
    const element = $('createGroupMessage');

    if (element) {
      element.textContent = message;
      element.style.color = isError ? '#b42318' : '#167447';
    } else {
      alert(message);
    }
  }

  function openModal() {
    $('createGroupModal')?.classList.remove('hidden');
  }

  function closeModal() {
    $('createGroupModal')?.classList.add('hidden');
    $('createGroupForm')?.reset();

    const message = $('createGroupMessage');

    if (message) {
      message.textContent = '';
    }
  }

  // Load communities and the current user's memberships.
  async function load() {
    if (loading) return;

    if (!db()) {
      console.error(
        '[Communities] supabaseClient is missing. Check script order.'
      );
      return;
    }

    if (!$('groupsList')) {
      console.warn(
        '[Communities] Could not find the groupsList HTML element.'
      );
      return;
    }

    loading = true;
    $('groupsList').innerHTML = '<p>Loading communities...</p>';

    try {
      const { data, error } = await db()
        .from('communities')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Communities] Load:', error);

        $('groupsList').innerHTML =
          `<p>Could not load communities: ${esc(error.message)}</p>`;

        return;
      }

      communities = data || [];

      const signedIn = await getUser();

      myMemberships = new Set();

      if (signedIn) {
        const { data: memberships, error: membershipError } =
          await db()
            .from('community_members')
            .select('community_id')
            .eq('user_id', signedIn.id);

        if (membershipError) {
          console.error(
            '[Communities] Membership load:',
            membershipError
          );
        } else {
          (memberships || []).forEach(membership => {
            myMemberships.add(String(membership.community_id));
          });
        }
        // A community owner is allowed to open their community even if an
        // older community is missing its owner row in community_members.
        communities.forEach(community => {
          if (String(community.owner_id) === String(signedIn.id)) {
            myMemberships.add(String(community.id));
          }
        });
      }

      render();

    } catch (error) {
      console.error('[Communities] Unexpected load error:', error);

      $('groupsList').innerHTML =
        '<p>Something went wrong loading communities. Please refresh.</p>';

    } finally {
      loading = false;
    }
  }

  // Remove duplicate state cards from the displayed list.
  // This does not delete anything from Supabase.
  function removeDisplayDuplicates(rows) {
    const seen = new Set();

    return rows.filter(community => {
      if (
        community.category !== 'states' ||
        !community.state
      ) {
        return true;
      }

      const key = community.state.trim().toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  // Display communities.
  function render() {
    const list = $('groupsList');

    if (!list) return;

    const search = (
      $('groupSearchInput')?.value || ''
    ).trim().toLowerCase();

    let rows = communities.filter(community => {
      const matchesCategory =
        category === 'all' ||
        community.category === category;

      const searchableText = [
        community.name,
        community.description,
        community.state,
        community.category
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return matchesCategory &&
        searchableText.includes(search);
    });

    rows = removeDisplayDuplicates(rows);

    if ($('groupsListTitle')) {
      $('groupsListTitle').textContent =
        category === 'all'
          ? 'Explore Communities'
          : `${category[0].toUpperCase()}${category.slice(1)} Communities`;
    }

    if ($('groupsListSubtitle')) {
      $('groupsListSubtitle').textContent =
        `${rows.length} ${rows.length === 1 ? 'community' : 'communities'} found`;
    }

    if (!rows.length) {
      list.innerHTML = `
        <div class="groups-empty">
          <h3>No communities found yet</h3>
          <p>Try another category or create a community.</p>
        </div>
      `;

      return;
    }

    list.innerHTML = rows.map(community => {
      const id = String(community.id);
      const isOwner =
        Boolean(user) &&
        String(community.owner_id) === String(user.id);

      const isMember = myMemberships.has(id);

      let buttonText = 'Join';
let buttonAction = 'join';

if (isOwner || isMember) {
buttonText = '💬 Open Chat';
buttonAction = 'chat';
}

      return `
        <article class="community-card"
          style="
            background:#fff;
            border:1px solid #dce9e0;
            border-radius:16px;
            padding:18px;
            margin:12px 0;
          ">

          <div style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:14px;
          ">

            <div style="flex:1;min-width:0;">
              <small style="
                color:#167447;
                font-weight:700;
              ">
                ${esc(community.category || 'community')}
                ${community.state
                  ? ' · ' + esc(community.state)
                  : ''}
              </small>

              <h3 style="margin:10px 0;">
                ${esc(community.name || 'Community')}
              </h3>

              <p style="margin:0;color:#66756b;">
                ${esc(
                  community.description ||
                  'Connect with people in this community.'
                )}
              </p>
            </div>

            <button
              type="button"
              data-community-action="${buttonAction}"
data-community-id="${esc(id)}"
              style="
                flex-shrink:0;
                min-width:90px;
                max-width:110px;
                padding:12px 10px;
                border:0;
                border-radius:10px;
                background:${isMember || isOwner ? '#e8f5ec' : '#13834c'};
                color:${isMember || isOwner ? '#167447' : '#ffffff'};
                font-weight:700;
                cursor:pointer;
                overflow-wrap:anywhere;
              "
            >
              ${buttonText}
            </button>

          </div>
        </article>
      `;
    }).join('');

    list.querySelectorAll('[data-community-action]').forEach(button => {
button.addEventListener('click', async () => {
const id = button.dataset.communityId;

if (button.dataset.communityAction === 'chat') {
  await openCommunityChat(id);
} else {
  await join(id);
}

});
});
  }
  
  // Community chat state.
let activeCommunity = null;
let chatRefreshTimer = null;
let chatSending = false;
let activeUserRole = 'member';

function canModerateCommunity() {
  return Boolean(
    user &&
    activeCommunity &&
    (
      String(activeCommunity.owner_id) === String(user.id) ||
      ['admin', 'moderator', 'owner'].includes(String(activeUserRole).toLowerCase())
    )
  );
}

async function refreshMyCommunityRole() {
  activeUserRole = 'member';
  if (!user || !activeCommunity || !db()) return;
  if (String(activeCommunity.owner_id) === String(user.id)) {
    activeUserRole = 'owner';
    return;
  }
  const { data, error } = await db()
    .from('community_members')
    .select('role')
    .eq('community_id', activeCommunity.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.warn('[Community Moderation] Could not load your role:', error.message);
    return;
  }
  activeUserRole = data?.role || 'member';
}

// Display a notice inside the chat window.
function chatNotice(message, isError = false) {
const element = $('communityChatNotice');

if (element) {
  element.textContent = message;
  element.style.color = isError ? '#b42318' : '#167447';
}

}
// Load community messages and display each sender's username.
async function loadCommunityMessages() {
if (!activeCommunity || !db()) return;

const messagesBox = $('communityChatMessages');
if (!messagesBox) return;

const communityId = String(activeCommunity.id);

const { data, error } = await db()
    .from('community_messages')
    .select('id, community_id, user_id, content, created_at, message_type, media_url, file_name, mime_type, file_size')
    .eq('community_id', communityId)
    .order('created_at', { ascending: true })
    .limit(100);

if (error) {
    console.error('[Community Chat] Load:', error);
    chatNotice('Could not load messages: ' + error.message, true);
    return;
}

// Ignore results if another community was opened.
if (
    !activeCommunity ||
    String(activeCommunity.id) !== communityId
) return;

const messages = data || [];

if (!messages.length) {
    messagesBox.innerHTML =
        '<p class="community-chat-empty">No messages yet. Say hello!</p>';
    chatNotice('');
    return;
}

// Collect unique sender IDs.
const senderIds = [
    ...new Set(
        messages.map(message => message.user_id).filter(Boolean)
    )
];

// Fetch sender profiles.
const usernameById = new Map();

if (senderIds.length) {
    const { data: profiles, error: profileError } = await db()
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', senderIds);

    if (profileError) {
        console.warn(
            '[Community Chat] Could not load usernames:',
            profileError.message
        );
    } else {
        (profiles || []).forEach(profile => {
            usernameById.set(String(profile.id), {
                username: profile.username || 'Member',
                avatar_url: profile.avatar_url || ''
            });
        });
    }
}

// The user may have left/switched chats while the profile request was running.
// Check the active community again before reading owner_id.
if (
    !activeCommunity ||
    String(activeCommunity.id) !== communityId
) {
    return;
}

// Load roles for message authors so badges are based on Supabase roles.
const roleByUserId = new Map();
if (activeCommunity.owner_id) {
    roleByUserId.set(String(activeCommunity.owner_id), 'owner');
}
if (senderIds.length) {
    const { data: roleRows, error: roleError } = await db()
        .from('community_members')
        .select('user_id, role')
        .eq('community_id', communityId)
        .in('user_id', senderIds);
    if (roleError) {
        console.warn('[Community Chat] Could not load sender roles:', roleError.message);
    } else {
        (roleRows || []).forEach(row => {
            const id = String(row.user_id);
            // Never let a membership row override the community's true owner.
            if (id !== String(activeCommunity.owner_id)) {
                roleByUserId.set(id, String(row.role || 'member').toLowerCase());
            }
        });
    }
}

// Check again in case the user switched communities.
if (
    !activeCommunity ||
    String(activeCommunity.id) !== communityId
) return;

// Render each message once.
messagesBox.innerHTML = messages.map(message => {
    const ownMessage =
        Boolean(user) &&
        String(message.user_id) === String(user.id);

    const profile =
        usernameById.get(String(message.user_id)) || {};

    const senderName = ownMessage
        ? 'You'
        : (profile.username || 'Member');

    const avatarUrl =
        profile.avatar_url ||
        'https://i.pravatar.cc/100?img=12';

    const time = message.created_at
        ? new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        })
        : '';

    const senderRole = roleByUserId.get(String(message.user_id)) || 'member';
    const roleLabel = ({
        owner: '👑 Owner',
        admin: '🛡️ Admin',
        moderator: '🛡️ Moderator',
        member: ''
    })[senderRole] || '';
    const roleBadge = roleLabel
        ? `<span class="community-role-badge community-role-${esc(senderRole)}">${esc(roleLabel)}</span>`
        : '';

    const clickableProfile = !ownMessage
        ? `
            <button
                type="button"
                class="community-member-profile"
                data-profile-user-id="${esc(message.user_id)}"
                style="display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:0;cursor:pointer;text-align:left;color:#167447;font-weight:700;flex-wrap:wrap;"
            >
                <img src="${esc(avatarUrl)}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">
                <span>${esc(senderName)}</span>
                ${roleBadge}
            </button>
        `
        : `<div class="community-message-author"><strong style="color:#167447;">You</strong>${roleBadge}</div>`;

    const isCommunityOwner =
        String(user?.id) === String(activeCommunity?.owner_id);

    const moderationAction = canModerateCommunity() &&
        (!ownMessage || isCommunityOwner)
        ? `<button type="button" class="community-delete-message" data-delete-message-id="${esc(message.id)}" data-message-author-id="${esc(message.user_id)}" aria-label="Delete message">Delete</button>`
        : '';
const messageCreatedAt = new Date(message.created_at).getTime();

const canEditOwnMessage =
    ownMessage &&
    Number.isFinite(messageCreatedAt) &&
    Date.now() >= messageCreatedAt &&
    Date.now() - messageCreatedAt <= 2 * 60 * 60 * 1000;

const ownMessageActions = ownMessage
    ? `
        ${canEditOwnMessage ? `
            <button
                type="button"
                class="community-edit-message"
                data-edit-message-id="${esc(message.id)}"
                aria-label="Edit your message"
            >Edit</button>
        ` : ''}

        ${isCommunityOwner ? `
            <button
                type="button"
                class="community-delete-message"
                data-delete-message-id="${esc(message.id)}"
                data-message-author-id="${esc(message.user_id)}"
                data-delete-own="true"
                aria-label="Delete your message"
            >Delete</button>
        ` : ''}
    `
    : '';
    
    return `
        <article style="
            margin:10px 0;
            padding:14px;
            border-radius:18px;
            background:${ownMessage ? '#dcf8e7' : '#f1f5f2'};
            max-width:85%;
            margin-left:${ownMessage ? 'auto' : '0'};
            overflow-wrap:anywhere;
        ">
            ${clickableProfile}

            ${renderCommunityMessageBody(message)}

<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
  <small style="color:#66756b;">${esc(time)}</small>

  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
  ${ownMessageActions}
  ${!ownMessage ? moderationAction : ''}
</div>
</div>
        </article>
    `;
}).join('');

// Open another member's existing profile.
messagesBox
    .querySelectorAll('.community-member-profile')
    .forEach(button => {
        button.addEventListener('click', async () => {
            const profileUserId = button.dataset.profileUserId;

            if (
                profileUserId &&
                typeof window.openUserProfile === 'function'
            ) {
                await window.openUserProfile(profileUserId);
            } else {
                console.error(
                    'Profile could not open. Check window.openUserProfile in script.js.'
                );
            }
        });
    });

messagesBox.querySelectorAll('[data-delete-message-id]').forEach(button => {
    button.addEventListener('click', async () => {
      const messageId = button.dataset.deleteMessageId;
      const messageAuthorId = button.dataset.messageAuthorId;
      const isOwnDelete = button.dataset.deleteOwn === 'true';

      if (!messageId) return;
      if (isOwnDelete) {
        if (String(messageAuthorId) !== String(user?.id)) return;
      } else if (!canModerateCommunity()) {
        return;
      }

      // Protect the community owner from moderator deletion attempts.
      const isOwnerMessage =
          String(messageAuthorId) === String(activeCommunity?.owner_id);

      const isCommunityOwner =
          String(user?.id) === String(activeCommunity?.owner_id);

      if (isOwnerMessage && !isCommunityOwner) {
    chatNotice(
        '🔒 Action not allowed: Only the community owner can delete their messages.',
        true
    );
    return;
}
      if (!window.confirm('Delete this message for everyone in the community?')) return;
      button.disabled = true;
      const { error: deleteError } = await db()
        .from('community_messages')
        .delete()
        .eq('id', messageId)
        .eq('community_id', communityId);
      if (deleteError) {
        console.error('[Community Moderation] Delete message:', deleteError);
        chatNotice('Could not delete message. Check the Supabase moderation policies.', true);
        button.disabled = false;
        return;
      }
      await loadCommunityMessages();
      chatNotice('Message deleted.');
    });
  });

messagesBox.querySelectorAll('[data-edit-message-id]').forEach(button => {
    button.addEventListener('click', async () => {
        const messageId = button.dataset.editMessageId;
        const article = button.closest('article');
        const currentText = article?.querySelector('.community-message-content')?.textContent || '';
        if (!messageId || !article) return;
        
        // Allow editing only your own messages within 2 hours.
const { data: messageToEdit, error: editCheckError } = await db()
    .from('community_messages')
    .select('created_at, user_id')
    .eq('id', messageId)
    .eq('community_id', communityId)
    .maybeSingle();

if (editCheckError || !messageToEdit) {
    chatNotice('Could not verify this message. Please try again.', true);
    return;
}

if (String(messageToEdit.user_id) !== String(user.id)) {
    chatNotice('You can only edit your own messages.', true);
    return;
}

const editCreatedAt = new Date(messageToEdit.created_at).getTime();

if (
    !Number.isFinite(editCreatedAt) ||
    Date.now() < editCreatedAt ||
    Date.now() - editCreatedAt > 2 * 60 * 60 * 1000
) {
    chatNotice('Messages can only be edited within 2 hours of sending.', true);
    await loadCommunityMessages();
    return;
}

        const updatedText = window.prompt('Edit your message:', currentText);
        if (updatedText === null) return;
        const content = updatedText.trim();
        if (!content) {
            chatNotice('A message cannot be empty.', true);
            return;
        }
        if (content === currentText) return;

        button.disabled = true;
        const { error: updateError } = await db()
            .from('community_messages')
            .update({ content })
            .eq('id', messageId)
            .eq('community_id', communityId)
            .eq('user_id', user.id);

        if (updateError) {
            console.error('[Community Chat] Edit message:', updateError);
            chatNotice('Could not edit message. Check the message update policy in Supabase.', true);
            button.disabled = false;
            return;
        }
        await loadCommunityMessages();
        chatNotice('Message updated.');
    });
});

messagesBox.scrollTop = messagesBox.scrollHeight;
chatNotice('');

}

// Show the community's member list using membership roles and profiles.
async function openCommunityMembers() {
  if (!activeCommunity || !db()) return;
  const panel = $('communityMembersPanel');
  const list = $('communityMembersList');
  const count = $('communityMembersCount');
  if (!panel || !list) return;

  panel.classList.remove('hidden');
  list.innerHTML = '<p class="community-members-loading">Loading members…</p>';
  if (count) count.textContent = 'Loading members…';

  const communityId = String(activeCommunity.id);
  const { data: memberships, error } = await db()
    .from('community_members')
    .select('user_id, role')
    .eq('community_id', communityId);

  if (error) {
    console.error('[Community Members] Load:', error);
    list.innerHTML = '<p>Could not load members. Check community_members table permissions.</p>';
    if (count) count.textContent = '';
    return;
  }

  const rows = memberships || [];
  const ids = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
  let profiles = [];
  if (ids.length) {
    const result = await db().from('profiles').select('id, username, avatar_url').in('id', ids);
    if (result.error) console.warn('[Community Members] Profiles:', result.error.message);
    profiles = result.data || [];
  }
  const byId = new Map(profiles.map(profile => [String(profile.id), profile]));
  if (!activeCommunity || String(activeCommunity.id) !== communityId) return;

  // Include the owner even if older data has no membership row for them.
  if (activeCommunity.owner_id && !ids.includes(activeCommunity.owner_id)) {
    ids.push(activeCommunity.owner_id);
    const ownerResult = await db().from('profiles').select('id, username, avatar_url').eq('id', activeCommunity.owner_id).maybeSingle();
    if (ownerResult.data) byId.set(String(ownerResult.data.id), ownerResult.data);
  }

  const roleById = new Map(rows.map(row => [String(row.user_id), row.role || 'member']));
  if (activeCommunity.owner_id) roleById.set(String(activeCommunity.owner_id), 'owner');
  if (count) count.textContent = `${ids.length} ${ids.length === 1 ? 'member' : 'members'}`;
  if (!ids.length) { list.innerHTML = '<p>No members found yet.</p>'; return; }

  list.innerHTML = ids.map(id => {
    const profile = byId.get(String(id)) || {};
    const name = profile.username || 'Member';
    const role = roleById.get(String(id)) || 'member';
    const avatar = profile.avatar_url || 'https://i.pravatar.cc/100?img=12';
    const isSelf = user && String(user.id) === String(id);
    const isOwnerAccount = String(id) === String(activeCommunity.owner_id);
    const showManage = canModerateCommunity() && !isSelf && !isOwnerAccount;
    const canManageRoles = ['owner', 'admin'].includes(String(activeUserRole).toLowerCase()) ||
      String(activeCommunity.owner_id) === String(user?.id);
    const memberAction = showManage
      ? `<span class="community-member-manage">
          ${canManageRoles ? `<button type="button" data-member-action="${role === 'moderator' ? 'demote' : 'promote'}" data-member-id="${esc(id)}" data-member-name="${esc(name)}">${role === 'moderator' ? 'Remove mod' : 'Make mod'}</button>` : ''}
          <button type="button" class="danger" data-member-action="remove" data-member-id="${esc(id)}" data-member-name="${esc(name)}">Remove</button>
        </span>`
      : '';
    return `<div class="community-member-row-wrap">
      <button type="button" class="community-member-row" data-member-profile-id="${esc(id)}">
        <img src="${esc(avatar)}" alt="" loading="lazy">
        <span class="community-member-row-name">${esc(name)}${isSelf ? ' (You)' : ''}</span>
        <span class="community-role-badge community-role-${esc(String(role).toLowerCase())}">${esc(({ owner: '👑 Owner', admin: '🛡️ Admin', moderator: '🛡️ Moderator', member: 'Member' })[String(role).toLowerCase()] || 'Member')}</span>
      </button>
      ${memberAction}
    </div>`;
  }).join('');

  list.querySelectorAll('[data-member-profile-id]').forEach(button => {
    button.addEventListener('click', async () => {
      const profileId = button.dataset.memberProfileId;
      panel.classList.add('hidden');
      if (profileId && typeof window.openUserProfile === 'function') {
        await window.openUserProfile(profileId);
      }
    });
  });

  list.querySelectorAll('[data-member-action]').forEach(button => {
    button.addEventListener('click', async event => {
      event.stopPropagation();
      if (!canModerateCommunity()) return;
      const memberId = button.dataset.memberId;
      const memberName = button.dataset.memberName || 'this member';
      const action = button.dataset.memberAction;
      if (!memberId || String(memberId) === String(activeCommunity.owner_id)) return;

      if (action === 'remove') {
        if (!window.confirm(`Remove ${memberName} from this community?`)) return;
        const { error: removeError } = await db()
          .from('community_members')
          .delete()
          .eq('community_id', communityId)
          .eq('user_id', memberId);
        if (removeError) {
          console.error('[Community Moderation] Remove member:', removeError);
          chatNotice('Could not remove member. Check Supabase moderation policies.', true);
          return;
        }
        chatNotice(`${memberName} was removed from the community.`);
      } else {
        const isAdmin = ['owner', 'admin'].includes(String(activeUserRole).toLowerCase()) ||
          String(activeCommunity.owner_id) === String(user?.id);
        if (!isAdmin) {
          chatNotice('Only the owner or an admin can change moderator roles.', true);
          return;
        }
        const nextRole = action === 'promote' ? 'moderator' : 'member';
        const { error: roleError } = await db()
          .from('community_members')
          .update({ role: nextRole })
          .eq('community_id', communityId)
          .eq('user_id', memberId);
        if (roleError) {
          console.error('[Community Moderation] Change role:', roleError);
          chatNotice('Could not change member role. Check Supabase moderation policies.', true);
          return;
        }
        chatNotice(`${memberName} is now ${nextRole === 'moderator' ? 'a moderator' : 'a member'}.`);
      }
      await openCommunityMembers();
    });
  });
}

// Share the community name and app page so friends can find and join it.
async function inviteToCommunity() {
  if (!activeCommunity) return;
  const inviteText = `Join my FREE CHAT community: ${activeCommunity.name || 'Community'}\nOpen FREE CHAT and find this community in Communities.`;
  try {
    if (navigator.share) {
      await navigator.share({ title: `Join ${activeCommunity.name || 'my community'}`, text: inviteText, url: window.location.href });
    } else if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(`${inviteText}\n${window.location.href}`);
      chatNotice('Invite text copied. Send it to your friends.');
    } else {
      window.prompt('Copy this invite text and send it to your friends:', `${inviteText}\n${window.location.href}`);
    }
  } catch (error) {
    if (error && error.name !== 'AbortError') {
      console.warn('[Community Invite]', error);
      chatNotice('Could not open sharing. Please try again.', true);
    }
  }
}

// Open a community conversation.
async function openCommunityChat(id) {
if (!db()) {
alert('The database is not connected.');
return;
}

const signedIn = await getUser();

if (!signedIn) {
  alert('Please sign in to use community chat.');
  return;
}

const community = communities.find(
  item => String(item.id) === String(id)
);

if (!community) {
  alert('Community not found. Please refresh and try again.');
  return;
}

// Owners can open their own community even if an older record is missing
// the matching community_members row. Other users must join first.
const isOwner = String(community.owner_id) === String(signedIn.id);
if (!isOwner && !myMemberships.has(String(id))) {
  alert('Please join this community before opening its chat.');
  return;
}
if (isOwner) myMemberships.add(String(id));

activeCommunity = community;
user = signedIn;
await refreshMyCommunityRole();

if ($('communityChatTitle')) {
  $('communityChatTitle').textContent = community.name || 'Community Chat';
}

if ($('communityChatSubtitle')) {
  $('communityChatSubtitle').textContent = 'Community conversation';
}

$('groupsList')?.classList.add('hidden');
$('groupsScreen')?.classList.add('hidden');
$('communityChatScreen')?.classList.remove('hidden');
$('communityMembersPanel')?.classList.add('hidden');

chatNotice('Loading messages...');

await loadCommunityMessages();

subscribeToCommunityMessages(community.id);

// Refresh periodically in case realtime is not configured.
if (chatRefreshTimer) {
  clearInterval(chatRefreshTimer);
}

chatRefreshTimer = setInterval(() => {
  loadCommunityMessages();
}, 5000);

}

// Subscribe to instant messages for the active community.
function subscribeToCommunityMessages(communityId) {
    if (!db()) return;

    // Remove the previous subscription before creating another.
    if (window.communityChatRealtimeChannel) {
        db().removeChannel(window.communityChatRealtimeChannel);
        window.communityChatRealtimeChannel = null;
    }

    const channel = db()
        .channel('community-chat-' + String(communityId))
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'community_messages',
                filter: 'community_id=eq.' + String(communityId)
            },
            async (payload) => {
                // Ignore messages if another community is now open.
                if (
                    !activeCommunity ||
                    String(activeCommunity.id) !== String(communityId)
                ) {
                    return;
                }

                // Reload the message list so the display stays consistent.
                await loadCommunityMessages();
            }
        )
        .subscribe((status) => {
            console.log('[Community Chat Realtime]', status);
        });

    window.communityChatRealtimeChannel = channel;
}

// Render text, image, video, and audio community messages safely.
function renderCommunityMessageBody(message) {
  const type = String(message.message_type || 'text').toLowerCase();
  const url = String(message.media_url || '');
  const safeUrl = esc(url);
  const filename = esc(message.file_name || '');
  if (type === 'image' && url) return `<div class="community-media-message"><img src="${safeUrl}" alt="${filename || 'Shared image'}" loading="lazy" onclick="window.open('${safeUrl}','_blank','noopener')"><p>${filename}</p></div>`;
  if (type === 'video' && url) return `<div class="community-media-message"><video controls playsinline preload="metadata" src="${safeUrl}"></video><p>${filename}</p></div>`;
  if (type === 'audio' && url) return `<div class="community-audio-message community-audio-player">
    <audio class="community-audio-source" preload="metadata" playsinline src="${safeUrl}" onloadedmetadata="window.initCommunityAudio(this)" ontimeupdate="window.updateCommunityAudio(this)" onended="window.finishCommunityAudio(this)">Your browser cannot play this audio.</audio>
    <button type="button" class="community-audio-play" aria-label="Play voice note" onclick="window.toggleCommunityAudio(this)">▶</button>
    <div class="community-audio-track">
      <div class="community-audio-wave" role="slider" aria-label="Seek voice note" tabindex="0" onclick="window.seekCommunityAudio(event,this)" onkeydown="if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();window.nudgeCommunityAudio(event,this)}">
        ${Array.from({length:30},(_,i)=>`<i style="height:${[7,12,9,16,11,18,8,14,10,17,6,13,18,9,15,7,12,17,10,14,8,18,11,6,15,9,13,17,8,12][i]}px"></i>`).join('')}
      </div>
      <div class="community-audio-meta"><span class="community-audio-current">0:00</span><span class="community-audio-duration">0:00</span></div>
    </div>
    <button type="button" class="community-audio-speed" onclick="window.cycleCommunityAudioSpeed(this)" aria-label="Playback speed">1×</button>
  </div>`;
  return `<p class="community-message-content" style="margin:8px 0;white-space:pre-wrap;">${esc(message.content || '')}</p>`;
}

// Compact community voice-note player with playback-speed control.
function communityAudioFormatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
window.initCommunityAudio = function(audio) {
  const player = audio.closest('.community-audio-player');
  if (!player) return;
  const duration = player.querySelector('.community-audio-duration');
  if (duration) duration.textContent = communityAudioFormatTime(audio.duration);
};
window.updateCommunityAudio = function(audio) {
  const player = audio.closest('.community-audio-player');
  if (!player) return;
  const current = player.querySelector('.community-audio-current');
  const wave = player.querySelector('.community-audio-wave');
  if (current) current.textContent = communityAudioFormatTime(audio.currentTime);
  if (wave) wave.style.setProperty('--audio-progress', (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%');
};
window.toggleCommunityAudio = async function(button) {
  const player = button.closest('.community-audio-player');
  const audio = player && player.querySelector('audio');
  if (!audio) return;
  if (audio.paused) {
    document.querySelectorAll('.community-audio-source').forEach(other => {
      if (other !== audio) { other.pause(); const otherButton = other.closest('.community-audio-player')?.querySelector('.community-audio-play'); if (otherButton) { otherButton.textContent = '▶'; otherButton.setAttribute('aria-label','Play voice note'); } }
    });
    try { await audio.play(); button.textContent = 'Ⅱ'; button.setAttribute('aria-label','Pause voice note'); }
    catch (error) { console.error('[Community audio] Playback failed:', error); if (typeof chatNotice === 'function') chatNotice('Could not play this voice note. Please try again.'); }
  } else { audio.pause(); button.textContent = '▶'; button.setAttribute('aria-label','Play voice note'); }
};
window.cycleCommunityAudioSpeed = function(button) {
  const player = button.closest('.community-audio-player');
  const audio = player && player.querySelector('audio');
  if (!audio) return;
  const rates = [1, 1.5, 2, 0.5];
  const current = Number(audio.playbackRate) || 1;
  const next = rates[(rates.indexOf(current) + 1) % rates.length];
  audio.playbackRate = next;
  button.textContent = (next === 1 ? '1' : String(next)) + '×';
  button.setAttribute('aria-label', 'Playback speed ' + next + ' times');
};
window.finishCommunityAudio = function(audio) {
  const player = audio.closest('.community-audio-player');
  const button = player && player.querySelector('.community-audio-play');
  if (button) { button.textContent = '▶'; button.setAttribute('aria-label','Play voice note'); }
  window.updateCommunityAudio(audio);
};
window.seekCommunityAudio = function(event, wave) {
  const audio = wave.closest('.community-audio-player')?.querySelector('audio');
  if (!audio || !Number.isFinite(audio.duration) || !audio.duration) return;
  const rect = wave.getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * audio.duration;
  window.updateCommunityAudio(audio);
};
window.nudgeCommunityAudio = function(event, wave) {
  const audio = wave.closest('.community-audio-player')?.querySelector('audio');
  if (audio && Number.isFinite(audio.duration)) { audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + (event.key === 'ArrowRight' ? 5 : -5))); window.updateCommunityAudio(audio); }
};

async function uploadCommunityMedia(file, forcedType = null) {
  const signedIn = await getUser();
  if (!signedIn || !activeCommunity || !db()) throw new Error('Sign in and open a community first.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Files must be 50 MB or smaller.');
  const communityId = String(activeCommunity.id);
  const ext = (file.name && file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'bin')).replace(/[^a-zA-Z0-9]/g, '').slice(0,10) || 'bin';
  const path = `community/${communityId}/${signedIn.id}_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error: uploadError } = await db().storage.from('chat-media').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream' });
  if (uploadError) throw uploadError;
  const { data: urlData } = db().storage.from('chat-media').getPublicUrl(path);
  const mediaUrl = urlData?.publicUrl;
  if (!mediaUrl) throw new Error('Could not create a media URL. Check the chat-media bucket settings.');
  const type = forcedType || (file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document');
  const { error } = await db().from('community_messages').insert({ community_id: activeCommunity.id, user_id: signedIn.id, content: type === 'audio' ? '🎙️ Voice note' : (file.name || `Shared ${type}`), message_type: type, media_url: mediaUrl, file_name: file.name || `voice-note.${ext}`, mime_type: file.type || 'application/octet-stream', file_size: file.size });
  if (error) throw error;
  await loadCommunityMessages();
}

async function handleCommunityMediaSelected(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  for (const file of files) {
    try { chatNotice(`Uploading ${file.name}…`); await uploadCommunityMedia(file); }
    catch (error) { console.error('[Community media]', error); chatNotice(`Could not send ${file.name}: ${error.message}`, true); }
  }
  chatNotice('');
}

let communityRecorder = null;
let communityRecorderStream = null;
let communityRecorderChunks = [];
async function toggleCommunityVoiceRecording() {
  const button = $('communityVoiceButton');
  if (communityRecorder && communityRecorder.state === 'recording') {
    if (button) { button.disabled = true; button.textContent = '⏳'; }
    communityRecorder.stop();
    return;
  }
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Voice recording is not supported in this browser.');
    if (!activeCommunity || !(await getUser())) throw new Error('Sign in and open a community first.');
    communityRecorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    communityRecorderChunks = [];
    const candidates = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
    communityRecorder = mimeType ? new MediaRecorder(communityRecorderStream, { mimeType }) : new MediaRecorder(communityRecorderStream);
    communityRecorder.ondataavailable = e => { if (e.data?.size) communityRecorderChunks.push(e.data); };
    communityRecorder.onerror = e => { console.error('[Community voice]', e.error); chatNotice('Voice recording failed.', true); cleanupCommunityRecorder(); };
    communityRecorder.onstop = async () => {
      const actualType = communityRecorder?.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(communityRecorderChunks, { type: actualType });
      cleanupCommunityRecorder();
      if (button) { button.disabled = false; button.textContent = '🎙️'; }
      if (!blob.size) { chatNotice('No voice audio was captured.', true); return; }
      const ext = actualType.includes('mp4') ? 'm4a' : actualType.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: actualType });
      try { chatNotice('Sending voice note…'); await uploadCommunityMedia(file, 'audio'); chatNotice('Voice note sent.'); }
      catch (error) { console.error('[Community voice send]', error); chatNotice('Could not send voice note: ' + error.message, true); }
    };
    communityRecorder.start(250);
    if (button) { button.textContent = '⏹️'; button.title = 'Stop and send voice note'; }
    chatNotice('Recording voice note… tap ⏹️ to send.');
  } catch (error) {
    console.error('[Community voice start]', error);
    cleanupCommunityRecorder();
    if (button) { button.disabled = false; button.textContent = '🎙️'; }
    chatNotice(error.message || 'Could not start voice recording.', true);
  }
}
function cleanupCommunityRecorder() {
  if (communityRecorderStream) communityRecorderStream.getTracks().forEach(track => track.stop());
  communityRecorderStream = null; communityRecorder = null; communityRecorderChunks = [];
}

// Send a message to the active community.
async function sendCommunityMessage(event) {
event.preventDefault();

if (chatSending) return;

const signedIn = await getUser();
const input = $('communityChatInput');

if (!signedIn || !activeCommunity || !input) {
  chatNotice('Please sign in and open a community first.', true);
  return;
}

const content = input.value.trim();

if (!content) return;

chatSending = true;

const sendButton = $('communityChatSendBtn');

if (sendButton) {
  sendButton.disabled = true;
  sendButton.textContent = 'Sending...';
}

try {
  const { error } = await db()
    .from('community_messages')
    .insert({
      community_id: activeCommunity.id,
      user_id: signedIn.id,
      content
    });

  if (error) {
    console.error('[Community Chat] Send:', error);
    chatNotice('Message not sent: ' + error.message, true);
    return;
  }

  input.value = '';
  await loadCommunityMessages();

} catch (error) {
  console.error('[Community Chat] Send error:', error);
  chatNotice('Something went wrong sending your message.', true);

} finally {
  chatSending = false;

  if (sendButton) {
    sendButton.disabled = false;
    sendButton.textContent = 'Send';
  }
}

}

// Return to the community list.
function closeCommunityChat() {
activeCommunity = null;
activeUserRole = 'member';

if (chatRefreshTimer) {
  clearInterval(chatRefreshTimer);
  chatRefreshTimer = null;
}

$('communityChatScreen')?.classList.add('hidden');
$('communityMembersPanel')?.classList.add('hidden');
$('groupsScreen')?.classList.remove('hidden');
$('groupsList')?.classList.remove('hidden');

chatNotice('');

}

  // Join a community.
  async function join(id) {
    if (!db()) {
      alert('The database is not connected.');
      return;
    }

    const signedIn = await getUser();

    if (!signedIn) {
      alert('Please sign in before joining a community.');
      return;
    }

    const community = communities.find(
      item => String(item.id) === String(id)
    );

    if (!community) {
      alert('Community not found. Please refresh the page.');
      return;
    }

    if (community.owner_id === signedIn.id) {
      alert('You created this community.');
      return;
    }

    // If already a member, do not insert another membership.
    if (myMemberships.has(String(id))) {
      alert('You have already joined this community.');
      return;
    }

    const buttons = document.querySelectorAll(
      `[data-community-id="${CSS.escape(String(id))}"]`
    );

    buttons.forEach(button => {
      button.disabled = true;
      button.textContent = 'Joining...';
    });

    try {
      const { error } = await db()
        .from('community_members')
        .insert({
          community_id: id,
          user_id: signedIn.id,
          role: 'member'
        });

      if (error) {
        // Handle a duplicate membership gracefully.
        if (/duplicate|unique/i.test(error.message || '')) {
          myMemberships.add(String(id));
          render();
          alert('You have already joined this community.');
          return;
        }

        console.error('[Communities] Join:', error);

        alert('Could not join community: ' + error.message);

        return;
      }

      myMemberships.add(String(id));

      render();

      alert(
        `You have joined ${community.name || 'this community'}!`
      );

    } catch (error) {
      console.error('[Communities] Join error:', error);
      alert('Something went wrong. Please try again.');

    } finally {
      buttons.forEach(button => {
        button.disabled = false;
      });
    }
  }

  // Create a community.
  async function create(event) {
    event.preventDefault();

    if (!db()) return;

    const signedIn = await getUser();

    if (!signedIn) {
      notice('Please sign in before creating a community.', true);
      return;
    }

    const name = (
      $('newGroupName')?.value || ''
    ).trim();

    const description = (
      $('newGroupDescription')?.value || ''
    ).trim();

    const type = $('newGroupCategory')?.value || 'custom';

    const state = $('newGroupState')?.value || null;

    const privacy = $('newGroupPrivacy')?.value || 'public';

    if (!name) {
      notice('Enter a community name.', true);
      return;
    }

    const button = $('saveNewGroupBtn');

    if (button) {
      button.disabled = true;
      button.textContent = 'Creating...';
    }

    const payload = {
      name,
      description,
      category: type,
      owner_id: signedIn.id,
      privacy
    };

    if (type === 'states' && state) {
      payload.state = state;
    }

    try {
      const { data, error } = await db()
        .from('communities')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        console.error('[Communities] Create:', error);

        notice(
          'Could not create community: ' + error.message,
          true
        );

        return;
      }

      const { error: memberError } = await db()
        .from('community_members')
        .insert({
          community_id: data.id,
          user_id: signedIn.id,
          role: 'owner'
        });

      if (memberError) {
        console.warn(
          '[Communities] Owner membership:',
          memberError.message
        );
      } else {
        myMemberships.add(String(data.id));
      }

      notice('Community created successfully!');

      closeModal();

      await load();

    } catch (error) {
      console.error('[Communities] Create error:', error);

      notice('Something went wrong creating the community.', true);

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Create Community';
      }
    }
  }

  // Open a category and scroll to its community list.
  async function showCategory(nextCategory) {
    category = nextCategory;

    const tabs = $('groupsCategories');

    tabs?.querySelectorAll('[data-category]').forEach(tab => {
      const active = tab.dataset.category === category;

      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });

    await load();

    $('groupsList')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  // Create missing state communities.
  // Existing state communities are reused rather than duplicated.
  async function ensureStates() {
    if (!db()) return;

    const signedIn = await getUser();

    if (!signedIn) {
      alert('Please sign in to explore state communities.');
      return;
    }

    // State communities are official shared spaces. Ordinary users may join
    // any number of them, but must never create state records under their own ID.
    if (String(signedIn.id) !== STATE_COMMUNITY_OWNER_ID) {
      await load();
      return;
    }

    const present = new Set(
      communities
        .filter(c => c.category === 'states' && c.state)
        .map(c => c.state.trim().toLowerCase())
    );

    const missing = STATES.filter(
      state => !present.has(state.toLowerCase())
    );

    if (!missing.length) {
      return;
    }

    for (const state of missing) {
      const { error } = await db()
        .from('communities')
        .insert({
          name: `${state} Community`,
          description:
            `Connect with people from ${state}, share updates, and meet your local community.`,
          category: 'states',
          state,
          owner_id: STATE_COMMUNITY_OWNER_ID,
          privacy: 'public'
        });

      if (error) {
        console.warn(
          `[Communities] Could not create ${state}:`,
          error.message
        );

        // Stop instead of repeatedly sending failed requests.
        break;
      }
    }

    await load();
  }

  // Connect the HTML controls.
  function wire() {
    if (wired) return;

    wired = true;
    
    // Connect the community chat Send button.
$('communityChatForm')?.addEventListener(
'submit',
sendCommunityMessage
);

const communityInput = $('communityChatInput');
const communityVoice = $('communityVoiceButton');
const communitySend = $('communityChatSendBtn');
const updateCommunityComposerMode = () => {
  const hasText = !!communityInput?.value.trim();
  if (communitySend) communitySend.classList.toggle('community-control-hidden', !hasText);
  if (communityVoice) communityVoice.classList.toggle('community-control-hidden', hasText);
};
communityInput?.addEventListener('input', updateCommunityComposerMode);
updateCommunityComposerMode();

document.addEventListener('click', event => {
  const menu = $('communityAttachmentMenu');
  const toggle = $('communityAttachButton');
  if (menu && !menu.contains(event.target) && !toggle?.contains(event.target)) {
    menu.classList.add('hidden');
  }
});

// Connect the chat Back button.
$('communityChatBackBtn')?.addEventListener(
  'click',
  closeCommunityChat
);

$('communityMembersBtn')?.addEventListener('click', openCommunityMembers);
$('communityMembersCloseBtn')?.addEventListener('click', () => $('communityMembersPanel')?.classList.add('hidden'));
$('communityInviteBtn')?.addEventListener('click', inviteToCommunity);

    $('createGroupBtn')?.addEventListener('click', openModal);

    $('createGroupForm')?.addEventListener('submit', create);

    $('groupSearchInput')?.addEventListener('input', render);

    // Category tabs.
    $('groupsCategories')
      ?.querySelectorAll('[data-category]')
      .forEach(tab => {
        tab.addEventListener('click', () => {
          showCategory(tab.dataset.category || 'all');
        });
      });

    // Explore States button.
    $('exploreStatesBtn')?.addEventListener('click', async () => {
      await showCategory('states');
      await ensureStates();
    });

    // Close the create modal when the backdrop is tapped.
    $('createGroupModal')?.addEventListener('click', event => {
      if (event.target === $('createGroupModal')) {
        closeModal();
      }
    });

    // Connect the Explore buttons on the landing cards.
    document.addEventListener('click', event => {
      const button = event.target.closest('button, a');

      if (!button) return;

      const text = (
        button.innerText ||
        button.textContent ||
        ''
      ).trim().toLowerCase();

      if (
        text.includes('explore communities')
      ) {
        event.preventDefault();
        showCategory('all');
        return;
      }

      if (!text.includes('explore')) return;

      const card = button.closest(
        '.groups-category-card, .category-card, .feature-card, article'
      );

      if (!card) return;

      const cardText = (
        card.innerText ||
        card.textContent ||
        ''
      ).toLowerCase();

      if (
        cardText.includes('find your state') ||
        cardText.includes('state community')
      ) {
        event.preventDefault();
        showCategory('states');
      } else if (
        cardText.includes('buy & sell') ||
        cardText.includes('marketplace')
      ) {
        event.preventDefault();
        showCategory('marketplace');
      } else if (
        cardText.includes('hangout') ||
        cardText.includes('events')
      ) {
        event.preventDefault();
        showCategory('hangout');
      }
    });

    // Populate the state selector.
    const select = $('newGroupState');

    if (select && select.options.length <= 1) {
      select.innerHTML =
        '<option value="">Choose a state (optional)</option>' +
        STATES.map(state =>
          `<option value="${esc(state)}">${esc(state)}</option>`
        ).join('');
    }
  }

// Start the module.
async function init() {
    if (!db()) {
        console.error(
            '[Communities] supabaseClient not found. Check script order.'
        );
        return;
    }

    wire();

    await getUser();

    await load();
}

// Expose functions referenced by inline HTML event handlers.
// This file runs inside an IIFE, so these functions are not global unless
// explicitly attached to window.

function toggleCommunityEmojiPicker(event) {
    if (event) event.preventDefault();
    const picker = document.getElementById('communityEmojiPicker');
    if (!picker) return;
    picker.classList.toggle('hidden');
}
function insertCommunityEmoji(emoji) {
    const input = document.getElementById('communityChatInput');
    const picker = document.getElementById('communityEmojiPicker');
    if (!input) return;
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    const cursor = start + emoji.length;
    input.focus();
    try { input.setSelectionRange(cursor, cursor); } catch (_) {}
    if (picker) picker.classList.add('hidden');
}


function toggleCommunityAttachmentMenu(event) {
  if (event) event.preventDefault();
  const menu = document.getElementById('communityAttachmentMenu');
  if (menu) menu.classList.toggle('hidden');
}
function closeCommunityAttachmentMenu() {
  document.getElementById('communityAttachmentMenu')?.classList.add('hidden');
}
function chooseCommunityMedia() {
  closeCommunityAttachmentMenu();
  document.getElementById('communityMediaInput')?.click();
}
function chooseCommunityDocument() {
  closeCommunityAttachmentMenu();
  document.getElementById('communityDocumentInput')?.click();
}
function chooseCommunityCameraPhoto() {
  // Use the device's image picker; browser camera capture is not available on every device.
  const input = document.getElementById('communityMediaInput');
  if (input) {
    input.setAttribute('accept', 'image/*');
    input.removeAttribute('multiple');
    input.click();
    window.setTimeout(() => {
      input.setAttribute('accept', 'image/*,video/*');
      input.setAttribute('multiple', '');
    }, 1000);
  }
}
function showCommunityFeatureNotice(message) {
  closeCommunityAttachmentMenu();
  if (typeof chatNotice === 'function') chatNotice(message);
  else window.alert(message);
}

window.handleCommunityMediaSelected = handleCommunityMediaSelected;
window.toggleCommunityAttachmentMenu = toggleCommunityAttachmentMenu;
window.chooseCommunityMedia = chooseCommunityMedia;
window.chooseCommunityDocument = chooseCommunityDocument;
window.chooseCommunityCameraPhoto = chooseCommunityCameraPhoto;
window.showCommunityFeatureNotice = showCommunityFeatureNotice;
window.toggleCommunityEmojiPicker = toggleCommunityEmojiPicker;
window.insertCommunityEmoji = insertCommunityEmoji;
window.toggleCommunityVoiceRecording = toggleCommunityVoiceRecording;
window.toggleCommunityVideoRecording = toggleCommunityVideoRecording;

/* Community video recording: records from camera/microphone and sends
   through the existing community media upload path. */
let communityVideoRecorder = null;
let communityVideoStream = null;
let communityVideoChunks = [];

function cleanupCommunityVideoRecorder() {
  if (communityVideoStream) {
    communityVideoStream.getTracks().forEach(track => track.stop());
    communityVideoStream = null;
  }
  communityVideoChunks = [];
  const button = $('communityVideoButton');
  if (button) {
    button.disabled = false;
    button.textContent = '🎥';
    button.title = 'Record and share a video';
    button.classList.remove('is-recording');
  }
}

async function toggleCommunityVideoRecording() {
  const button = $('communityVideoButton');
  if (communityVideoRecorder && communityVideoRecorder.state === 'recording') {
    if (button) { button.disabled = true; button.textContent = '⏳'; }
    communityVideoRecorder.stop();
    return;
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error('Video recording is not supported in this browser. Use 📎 to attach a saved video instead.');
    }
    if (!activeCommunity || !(await getUser())) {
      throw new Error('Sign in and open a community first.');
    }

    communityVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: true
    });
    communityVideoChunks = [];

    const candidates = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
    communityVideoRecorder = mimeType
      ? new MediaRecorder(communityVideoStream, { mimeType })
      : new MediaRecorder(communityVideoStream);

    communityVideoRecorder.ondataavailable = e => {
      if (e.data && e.data.size) communityVideoChunks.push(e.data);
    };
    communityVideoRecorder.onerror = e => {
      console.error('[Community video]', e.error || e);
      cleanupCommunityVideoRecorder();
      chatNotice('Video recording failed. Please try again.', true);
    };
    communityVideoRecorder.onstop = async () => {
      const actualType = communityVideoRecorder?.mimeType || mimeType || 'video/webm';
      const blob = new Blob(communityVideoChunks, { type: actualType });
      cleanupCommunityVideoRecorder();
      if (!blob.size) { chatNotice('No video was recorded.', true); return; }

      const ext = actualType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `community-video-${Date.now()}.${ext}`, { type: actualType });
      if (file.size > 50 * 1024 * 1024) {
        chatNotice('This video is over the 50 MB limit. Please record a shorter video.', true);
        return;
      }

      try {
        chatNotice('Uploading community video…');
        await uploadCommunityMedia(file, 'video');
        chatNotice('Video sent to the community.');
      } catch (error) {
        console.error('[Community video send]', error);
        chatNotice('Could not send video: ' + (error.message || 'upload failed'), true);
      }
    };

    communityVideoRecorder.start(250);
    if (button) {
      button.textContent = '⏹️';
      button.title = 'Stop recording and send video';
      button.classList.add('is-recording');
    }
    chatNotice('Recording community video… tap ⏹️ to stop and send.');
  } catch (error) {
    console.error('[Community video start]', error);
    cleanupCommunityVideoRecorder();
    let message = error.message || 'Could not start video recording.';
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      message = 'Allow camera and microphone access in your browser settings, then try again.';
    } else if (error.name === 'NotFoundError') {
      message = 'No camera was found on this device.';
    } else if (error.name === 'NotReadableError') {
      message = 'The camera may be in use by another app. Close it and try again.';
    }
    chatNotice(message, true);
  }
}
window.toggleCommunityVideoRecording = toggleCommunityVideoRecording;

window.FreeChatCommunities = {
    init,
    load,
    render,
    join,
    showCategory,
    openCreateModal: openModal,
    closeCreateModal: closeModal,
    handleCommunityMediaSelected,
    toggleCommunityAttachmentMenu,
    chooseCommunityMedia,
    chooseCommunityDocument,
    chooseCommunityCameraPhoto,
    showCommunityFeatureNotice,
    toggleCommunityVoiceRecording,
    toggleCommunityVideoRecording,
    toggleCommunityEmojiPicker,
    insertCommunityEmoji,
    states: STATES.slice()
};

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {
      once: true
    });
  } else {
    init();
  }
})();


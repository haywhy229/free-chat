(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const db = () => window.supabaseClient;

  let currentUser = null;
  let rooms = [];
  let activeRoom = null;
  let micStream = null;
  let micEnabled = false;
  let handRaised = false;
  let isMember = false;
  let isHost = false;
  let chatChannel = null;
  let audioSignalChannel = null;
  let memberWatchChannel = null;
  let peerConnections = new Map();
  let processedSignalIds = new Set();
  let myRoomRole = 'listener';
  let remoteAudioElements = new Map();
  let audioStarting = false;
  let seatRequestStatus = null;
  let hostNames = new Map();

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);

  function showNotice(message) {
    const el = $('notice');
    if (!el) return;

    el.textContent = message;
    el.classList.add('show');

    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => {
      el.classList.remove('show');
    }, 5000);
  }

  function canTransmitRole(role = myRoomRole) {
    return ['host', 'speaker', 'moderator'].includes(String(role || '').toLowerCase());
  }

  function getAudioElement(userId) {
    let audio = remoteAudioElements.get(String(userId));
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.partyAudioUser = String(userId);
      audio.style.display = 'none';
      document.body.appendChild(audio);
      remoteAudioElements.set(String(userId), audio);
    }
    return audio;
  }

  async function sendAudioSignal(recipientId, signalType, payload) {
    if (!activeRoom || !currentUser) return;
    const { error } = await db().from('voice_room_signals').insert({
      room_id: activeRoom.id,
      sender_id: currentUser.id,
      recipient_id: recipientId,
      signal_type: signalType,
      payload
    });
    if (error) throw error;
  }

  function closePeer(userId) {
    const key = String(userId);
    const pc = peerConnections.get(key);
    if (pc) {
      try { pc.close(); } catch (_) {}
      peerConnections.delete(key);
    }
    const audio = remoteAudioElements.get(key);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      remoteAudioElements.delete(key);
    }
  }

  async function createPeerConnection(peerId, shouldOffer = false) {
    const key = String(peerId);
    if (peerConnections.has(key)) return peerConnections.get(key);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnections.set(key, pc);

    if (micStream && micEnabled && canTransmitRole()) {
      micStream.getAudioTracks().forEach(track => pc.addTrack(track, micStream));
    }

    pc.onicecandidate = async event => {
      if (!event.candidate || !activeRoom) return;
      try {
        await sendAudioSignal(key, 'ice-candidate', event.candidate.toJSON());
      } catch (error) {
        console.warn('[Party audio] ICE signal:', error.message);
      }
    };
    pc.ontrack = event => {
      const stream = event.streams?.[0];
      if (!stream) return;
      const audio = getAudioElement(key);
      audio.srcObject = stream;
      audio.play().catch(() => showNotice('Tap the page once to allow Party Room audio playback.'));
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(key);
    };

    if (shouldOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendAudioSignal(key, 'offer', pc.localDescription.toJSON());
    }
    return pc;
  }

  async function handleAudioSignal(signal) {
    if (!signal || !activeRoom || String(signal.room_id) !== String(activeRoom.id)) return;
    if (String(signal.recipient_id) !== String(currentUser?.id)) return;
    if (processedSignalIds.has(String(signal.id))) return;
    processedSignalIds.add(String(signal.id));
    if (processedSignalIds.size > 1000) processedSignalIds.clear();
    const senderId = String(signal.sender_id);
    try {
      if (signal.signal_type === 'offer') {
        if (canTransmitRole()) return;
        const pc = await createPeerConnection(senderId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendAudioSignal(senderId, 'answer', pc.localDescription.toJSON());
      } else if (signal.signal_type === 'answer') {
        const pc = peerConnections.get(senderId);
        if (pc && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        }
      } else if (signal.signal_type === 'ice-candidate') {
        const pc = peerConnections.get(senderId);
        if (pc && signal.payload) {
          try { await pc.addIceCandidate(new RTCIceCandidate(signal.payload)); }
          catch (error) { console.warn('[Party audio] ICE candidate:', error.message); }
        }
      }
    } catch (error) {
      console.error('[Party audio] Signal handling:', error);
    }
  }

  async function offerToRoomListeners() {
    if (!activeRoom || !currentUser || !micEnabled || !canTransmitRole()) return;
    const { data: members, error } = await db().from('voice_room_members')
      .select('user_id,role').eq('room_id', activeRoom.id);
    if (error) throw error;
    for (const member of (members || [])) {
      if (String(member.user_id) === String(currentUser.id)) continue;
      if (canTransmitRole(member.role)) continue;
      await createPeerConnection(member.user_id, true);
    }
  }

  async function startRoomAudio(roomId) {
    await stopRoomAudio();
    const { data: mine, error: roleError } = await db().from('voice_room_members')
      .select('role').eq('room_id', roomId).eq('user_id', currentUser.id).single();
    if (roleError) throw roleError;
    myRoomRole = mine.role || 'listener';
    processedSignalIds.clear();

    audioSignalChannel = db().channel(`party-audio-signals-${roomId}-${currentUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_room_signals', filter: `room_id=eq.${roomId}` }, payload => {
        handleAudioSignal(payload.new);
      }).subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Party audio] Signal subscription:', status);
          showNotice('Audio signaling connection failed. Check Realtime and table policies.');
        }
      });

    memberWatchChannel = db().channel(`party-audio-members-${roomId}-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_room_members', filter: `room_id=eq.${roomId}` }, async payload => {
        const changedId = String(payload.new?.user_id || payload.old?.user_id || '');
        if (!changedId || changedId === String(currentUser.id)) return;
        if (payload.eventType === 'DELETE') closePeer(changedId);
        if (micEnabled && canTransmitRole()) {
          try { await offerToRoomListeners(); } catch (error) { console.warn('[Party audio] New member offer:', error); }
        }
      }).subscribe();

    // Speakers joining an already populated room offer to existing listeners.
    if (canTransmitRole() && micEnabled) await offerToRoomListeners();
  }

  async function stopRoomAudio() {
    if (audioSignalChannel && db()) await db().removeChannel(audioSignalChannel).catch(() => {});
    if (memberWatchChannel && db()) await db().removeChannel(memberWatchChannel).catch(() => {});
    audioSignalChannel = null;
    memberWatchChannel = null;
    [...peerConnections.keys()].forEach(closePeer);
    remoteAudioElements.forEach(audio => { audio.srcObject = null; audio.remove(); });
    remoteAudioElements.clear();
    processedSignalIds.clear();
  }

  function stopMicrophone() {
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    micEnabled = false;
    peerConnections.forEach(pc => {
      pc.getSenders().forEach(sender => {
        if (sender.track?.kind === 'audio') {
          try { pc.removeTrack(sender); } catch (_) {}
        }
      });
    });
    if ($('micBtn')) $('micBtn').classList.remove('enabled');
    if ($('micIcon')) $('micIcon').textContent = '🎙️';
    if ($('micLabel')) $('micLabel').textContent = 'Enable my mic';
  }

  async function getUser() {
    if (!db()) {
      showNotice('Supabase is not connected. Check supabase.js.');
      return null;
    }

    try {
      const { data, error } = await db().auth.getUser();

      if (error || !data?.user) {
        showNotice('Please sign in to FREE CHAT first.');
        return null;
      }

      currentUser = data.user;
      return currentUser;
    } catch (error) {
      console.error('[Party] Login check:', error);
      showNotice('Could not check your login. Refresh and try again.');
      return null;
    }
  }

  async function loadRooms() {
    if (!db()) {
      $('roomsList').innerHTML =
        '<div class="empty">Supabase is not connected.</div>';
      return;
    }

    $('roomsList').innerHTML =
      '<div class="empty">Loading parties…</div>';

    try {
      const { data, error } = await db()
        .from('voice_rooms')
        .select('id,name,topic,host_id,visibility,status,created_at,allow_anyone_seat')
        .eq('status', 'active')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      rooms = data || [];
      hostNames = new Map();
      const hostIds = [...new Set(rooms.map(room => room.host_id).filter(Boolean))];
      if (hostIds.length) {
        const { data: profiles, error: profileError } = await db()
          .from('profiles').select('id,username').in('id', hostIds);
        if (profileError) console.warn('[Party] Host profile names:', profileError.message);
        (profiles || []).forEach(profile => hostNames.set(String(profile.id), profile.username || 'FREE CHAT user'));
      }
      const counts = await Promise.all(rooms.map(async room => {
        const result = await db()
          .from('voice_room_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('room_id', room.id);

        return { ...room, member_count: result.count || 0 };
      }));

      rooms = counts;
      renderRooms();
    } catch (error) {
      console.error('[Party] Load rooms:', error);
      $('roomsList').innerHTML =
        '<div class="empty">Could not load parties. Check the Supabase voice-room tables and access policies.</div>';
    }
  }

  function renderRooms() {
    $('roomCount').textContent =
      `${rooms.length} room${rooms.length === 1 ? '' : 's'}`;

    if (!rooms.length) {
      $('roomsList').innerHTML =
        '<div class="empty">No public parties yet. Create the first one! 🎙️</div>';
      return;
    }

    $('roomsList').innerHTML = rooms.map(room => `
      <article class="room-card">
        <div class="room-top">
          <div class="room-icon">🎙️</div>
          <div>
            <div class="room-title">${esc(room.name)}</div>
            <div class="room-topic">${esc(room.topic || 'Open conversation')}</div>
          </div>
        </div>
        <div class="room-meta">
          <span class="pill">🟢 Open party</span>
          <span class="pill">👥 ${Number(room.member_count) || 0} members</span>
          <span class="pill">👑 Host: ${esc(room.host_id === currentUser?.id ? 'You' : (hostNames.get(String(room.host_id)) || 'FREE CHAT user'))}</span>
          <span class="pill">${room.allow_anyone_seat ? '🔓 Open seats' : '✋ Ask host for seat'}</span>
        </div>
        <div class="room-actions">
          <button class="primary join-btn" data-id="${esc(room.id)}">
            Enter party →
          </button>
        </div>
      </article>
    `).join('');

    document.querySelectorAll('.join-btn').forEach(button => {
      button.addEventListener('click', () => enterRoom(button.dataset.id));
    });
  }

  async function createRoom(event) {
    event.preventDefault();

    if (!currentUser) {
      showNotice('Please sign in to FREE CHAT first.');
      return;
    }

    const name = $('roomName').value.trim();
    const topic = $('roomTopic').value.trim();
    const visibility = $('roomType').value;

    if (!name) {
      showNotice('Enter a party name.');
      return;
    }

    const button = $('createForm').querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Creating…';

    try {
      const { data: room, error } = await db()
        .from('voice_rooms')
        .insert({
          name,
          topic: topic || null,
          visibility,
          host_id: currentUser.id,
          status: 'active'
        })
        .select('id,name,topic,host_id,visibility,status,created_at,allow_anyone_seat')
        .single();

      if (error) throw error;

      const { error: memberError } = await db()
        .from('voice_room_members')
        .upsert({
          room_id: room.id,
          user_id: currentUser.id,
          role: 'host'
        }, {
          onConflict: 'room_id,user_id'
        });

      if (memberError) {
        console.error('[Party] Host membership:', memberError);
        showNotice('Party created, but membership failed. Check your Supabase policies.');
      }

      $('createModal').classList.add('hidden');
      $('createForm').reset();

      await loadRooms();

      if (visibility === 'public') {
        await enterRoom(room.id);
      } else {
        showNotice('Private party created. It is not listed publicly; invitations are not available yet.');
      }
    } catch (error) {
      console.error('[Party] Create room:', error);
      showNotice(error.message || 'Could not create party. Check Supabase.');
    } finally {
      button.disabled = false;
      button.textContent = 'Create party ✦';
    }
  }

  async function enterRoom(roomId) {
    if (!currentUser) {
      showNotice('Please sign in first.');
      return;
    }

    const room = rooms.find(item => String(item.id) === String(roomId));

    if (!room) {
      showNotice('That party could not be found. Refresh the list.');
      return;
    }

    try {
      const { error } = await db()
        .from('voice_room_members')
        .upsert({
          room_id: room.id,
          user_id: currentUser.id,
          role: room.host_id === currentUser.id ? 'host' : 'listener',
          joined_at: new Date().toISOString()
        }, {
          onConflict: 'room_id,user_id'
        });

      if (error) throw error;

      activeRoom = room;
      isHost = room.host_id === currentUser.id;
      isMember = true;
      handRaised = false;

      $('lobby').classList.add('hidden');
      $('partyRoom').classList.remove('hidden');

      $('activeRoomName').textContent = room.name;
      $('activeRoomTopic').textContent = room.topic || 'Meet and chat with everyone';
      seatRequestStatus = null;
      updateSeatControls();
      await loadMySeatRequest();
      await loadSeatRequests();
      await loadModeratorPanel();

      $('chatMessages').innerHTML =
        '<div class="system-message">You joined the live party. Earlier messages are not shown on re-entry.</div>';

      renderSeats();
      await updateMemberCount();
      await startRoomChat(room.id);
      await startRoomAudio(room.id);

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('[Party] Join room:', error);
      showNotice(error.message || 'Could not join this party.');
    }
  }

  function updateSeatControls() {
    const toggle = $('allowAnyoneSeat');
    const requestBtn = $('requestSeatBtn');
    const status = $('seatRequestStatus');
    const requestPanel = $('seatRequestsPanel');
    if (toggle) {
      toggle.checked = Boolean(activeRoom?.allow_anyone_seat);
      toggle.disabled = !isHost;
      toggle.closest('label')?.classList.toggle('hidden', !isHost);
    }
    if (requestBtn) {
      requestBtn.classList.toggle('hidden', isHost || Boolean(activeRoom?.allow_anyone_seat));
      requestBtn.disabled = seatRequestStatus === 'pending' || seatRequestStatus === 'approved';
      requestBtn.textContent = seatRequestStatus === 'pending' ? 'Request pending…' :
        seatRequestStatus === 'approved' ? 'Seat approved ✓' : '✋ Request a seat';
    }
    if (status) {
      status.textContent = activeRoom?.allow_anyone_seat
        ? 'Open seating is enabled. Members may take a seat without asking.'
        : 'Seat requests need the host’s approval.';
    }
    if (requestPanel) requestPanel.classList.toggle('hidden', !isHost);
  }

  async function loadMySeatRequest() {
    if (!activeRoom || !currentUser || isHost || !db()) return;
    try {
      const { data, error } = await db().from('voice_room_seat_requests')
        .select('status').eq('room_id', activeRoom.id)
        .eq('user_id', currentUser.id).maybeSingle();
      if (error) throw error;
      seatRequestStatus = data?.status || null;
      updateSeatControls();
    } catch (error) {
      console.warn('[Party] My seat request:', error.message);
    }
  }

  async function requestSeat() {
    if (!activeRoom || !currentUser || isHost) return;
    if (activeRoom.allow_anyone_seat) {
      showNotice('The host has enabled open seating. You can take a seat without a request.');
      return;
    }
    try {
      const { data: existing, error: findError } = await db()
        .from('voice_room_seat_requests').select('id,status')
        .eq('room_id', activeRoom.id).eq('user_id', currentUser.id).maybeSingle();
      if (findError) throw findError;
      if (existing?.status === 'pending') {
        seatRequestStatus = 'pending'; updateSeatControls();
        showNotice('Your seat request is already waiting for the host.'); return;
      }
      if (existing?.status === 'approved') {
        seatRequestStatus = 'approved'; updateSeatControls();
        showNotice('Your seat request was already approved.'); return;
      }
      if (existing) {
        const { error } = await db().from('voice_room_seat_requests')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', existing.id).eq('user_id', currentUser.id);
        if (error) throw error;
      } else {
        const { error } = await db().from('voice_room_seat_requests').insert({
          room_id: activeRoom.id, user_id: currentUser.id, status: 'pending'
        });
        if (error) throw error;
      }
      seatRequestStatus = 'pending'; updateSeatControls(); await loadSeatRequests();
      showNotice('Seat request sent to the host.');
    } catch (error) {
      console.error('[Party] Request seat:', error);
      showNotice(error.message || 'Could not request a seat. Check the seat-request table policies.');
    }
  }

  async function loadSeatRequests() {
    if (!activeRoom || !isHost || !db()) return;
    const list = $('seatRequestsList');
    if (!list) return;
    try {
      const { data: requests, error } = await db().from('voice_room_seat_requests')
        .select('id,user_id,status,created_at')
        .eq('room_id', activeRoom.id).eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!requests?.length) { list.innerHTML = '<p class="hint">No pending seat requests.</p>'; return; }
      const ids = [...new Set(requests.map(r => r.user_id))];
      const { data: profiles, error: profileError } = await db().from('profiles')
        .select('id,username').in('id', ids);
      if (profileError) console.warn('[Party] Requester profiles:', profileError.message);
      const names = new Map((profiles || []).map(p => [String(p.id), p.username || 'FREE CHAT user']));
      list.innerHTML = requests.map(r => `<div class="seat-request-row"><span>${esc(names.get(String(r.user_id)) || 'FREE CHAT user')}</span><span class="seat-request-actions"><button type="button" data-seat-approve="${esc(r.id)}">Approve</button><button type="button" data-seat-reject="${esc(r.id)}">Reject</button></span></div>`).join('');
      list.querySelectorAll('[data-seat-approve]').forEach(btn => btn.addEventListener('click', () => decideSeatRequest(btn.dataset.seatApprove, 'approved')));
      list.querySelectorAll('[data-seat-reject]').forEach(btn => btn.addEventListener('click', () => decideSeatRequest(btn.dataset.seatReject, 'rejected')));
    } catch (error) {
      console.error('[Party] Load seat requests:', error);
      list.innerHTML = '<p class="hint">Could not load requests. Check table permissions.</p>';
    }
  }

  async function decideSeatRequest(requestId, decision) {
    if (!activeRoom || !isHost || !currentUser) return;
    try {
      const { data: request, error: readError } = await db().from('voice_room_seat_requests')
        .select('id,user_id').eq('id', requestId).eq('room_id', activeRoom.id).maybeSingle();
      if (readError) throw readError;
      if (!request) throw new Error('Seat request no longer exists.');
      const { error } = await db().from('voice_room_seat_requests')
        .update({ status: decision, updated_at: new Date().toISOString() })
        .eq('id', requestId).eq('room_id', activeRoom.id);
      if (error) throw error;
      if (decision === 'approved') {
        const { error: memberError } = await db().from('voice_room_members')
          .update({ role: 'speaker' }).eq('room_id', activeRoom.id).eq('user_id', request.user_id);
        if (memberError) console.warn('[Party] Speaker role update:', memberError.message);
      }
      await loadSeatRequests();
      showNotice(decision === 'approved' ? 'Seat request approved.' : 'Seat request rejected.');
    } catch (error) {
      console.error('[Party] Decide seat request:', error);
      showNotice(error.message || 'Could not update seat request.');
    }
  }

  async function changeOpenSeating() {
    if (!activeRoom || !isHost || !currentUser) return;
    const allow = $('allowAnyoneSeat').checked;
    try {
      const { error } = await db().from('voice_rooms')
        .update({ allow_anyone_seat: allow })
        .eq('id', activeRoom.id).eq('host_id', currentUser.id);
      if (error) throw error;
      activeRoom.allow_anyone_seat = allow;
      const lobbyRoom = rooms.find(r => String(r.id) === String(activeRoom.id));
      if (lobbyRoom) lobbyRoom.allow_anyone_seat = allow;
      updateSeatControls();
      showNotice(allow ? 'Open seating enabled.' : 'Host approval is required for seats.');
      await loadRooms();
    } catch (error) {
      $('allowAnyoneSeat').checked = !allow;
      console.error('[Party] Seat setting:', error);
      showNotice(error.message || 'Could not save seat setting. Check voice_rooms update policies.');
    }
  }

  async function updateMemberCount() {
    if (!activeRoom) return;

    try {
      const { count, error } = await db()
        .from('voice_room_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('room_id', activeRoom.id);

      if (error) throw error;

      $('memberCount').textContent = count || 0;
    } catch (error) {
      console.warn('[Party] Member count:', error);
      $('memberCount').textContent = '—';
    }
  }


  async function loadModeratorPanel() {
    const panel = $('moderatorPanel');
    const list = $('moderatorMembersList');
    if (!panel || !list || !activeRoom) return;
    panel.classList.toggle('hidden', !isHost);
    if (!isHost) return;
    list.innerHTML = '<p class="hint">Loading participants…</p>';
    try {
      const { data: members, error } = await db()
        .from('voice_room_members')
        .select('user_id,role,joined_at')
        .eq('room_id', activeRoom.id)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      const rows = members || [];
      const ids = rows.map(m => m.user_id).filter(Boolean);
      const names = new Map();
      if (ids.length) {
        const { data: profiles, error: profileError } = await db()
          .from('profiles').select('id,username').in('id', ids);
        if (profileError) console.warn('[Party] Participant profiles:', profileError.message);
        (profiles || []).forEach(p => names.set(String(p.id), p.username || 'FREE CHAT user'));
      }
      if (!rows.length) {
        list.innerHTML = '<p class="hint">No participants found.</p>';
        return;
      }
      list.innerHTML = rows.map(m => {
        const mine = String(m.user_id) === String(currentUser?.id);
        const isRoomHost = String(m.user_id) === String(activeRoom.host_id) || m.role === 'host';
        const role = String(m.role || 'listener').toUpperCase();
        const name = mine ? 'You' : (names.get(String(m.user_id)) || 'FREE CHAT user');
        let action = '';
        if (!isRoomHost && !mine) {
          action = m.role === 'moderator'
            ? `<button type="button" data-mod-user="${esc(m.user_id)}" data-mod-action="demote">Remove moderator</button>`
            : `<button type="button" data-mod-user="${esc(m.user_id)}" data-mod-action="promote">Make moderator</button>`;
          action += ` <button type="button" data-remove-user="${esc(m.user_id)}">Remove participant</button>`;
        }
        return `<div class="seat-request-row"><span><strong>${esc(name)}</strong><small class="moderator-role-label">${esc(role)}</small></span><span class="seat-request-actions">${action}</span></div>`;
      }).join('');
      list.querySelectorAll('[data-mod-user]').forEach(button => {
        button.addEventListener('click', () => setModerator(button.dataset.modUser, button.dataset.modAction === 'promote'));
      });
      list.querySelectorAll('[data-remove-user]').forEach(button => {
        button.addEventListener('click', () => removeParticipant(button.dataset.removeUser));
      });
    } catch (error) {
      console.error('[Party] Load moderator panel:', error);
      list.innerHTML = `<p class="hint">Could not load participants: ${esc(error.message || 'Unknown error')}</p>`;
    }
  }

  async function setModerator(userId, makeModerator) {
    if (!isHost || !activeRoom || !userId || String(userId) === String(currentUser?.id)) {
      showNotice('Only the host can change another participant’s moderator role.');
      return;
    }
    try {
      const { data, error } = await db().rpc('set_voice_room_moderator', {
        p_room_id: activeRoom.id,
        p_user_id: userId,
        p_make_moderator: makeModerator
      });
      if (error) throw error;
      showNotice(makeModerator ? 'Participant promoted to moderator.' : 'Moderator role removed.');
      await loadModeratorPanel();
      await renderSeats();
    } catch (error) {
      console.error('[Party] Set moderator:', error);
      showNotice(error.message || 'Could not update moderator role. Confirm the moderator SQL was run successfully.');
    }
  }

  async function removeParticipant(userId) {
    if (!isHost || !activeRoom || !userId || String(userId) === String(currentUser?.id)) {
      showNotice('Only the host can remove another participant.');
      return;
    }
    if (!window.confirm('Remove this participant from the party? They may be able to rejoin if the room is public.')) return;
    try {
      const { error } = await db().rpc('remove_voice_room_participant', {
        p_room_id: activeRoom.id,
        p_user_id: userId
      });
      if (error) throw error;
      showNotice('Participant removed from the party.');
      await loadModeratorPanel();
      await renderSeats();
      await updateMemberCount();
    } catch (error) {
      console.error('[Party] Remove participant:', error);
      showNotice(error.message || 'Could not remove participant. Confirm the participant-removal SQL was run.');
    }
  }

  function renderSeats() {
    if (!activeRoom) return;

    // Always render the host once. The host is also the current user,
    // so do not add a second "You" seat when the host raises their hand.
    const seats = [
      {
        name: isHost ? 'You (Host)' : 'Party Host',
        role: isHost && handRaised ? 'HOST • HAND RAISED' : 'HOST',
        icon: '👑',
        host: true,
        mic: isHost ? micEnabled : false
      }
    ];

    // Non-host members get their own listener seat. A host must never
    // appear again as a listener seat.
    if (!isHost && isMember) {
      seats.push({
        name: currentUser?.email?.split('@')[0] || 'You',
        role: handRaised ? 'HAND RAISED' : 'LISTENER',
        icon: '🙂',
        host: false,
        mic: micEnabled
      });
    }

    while (seats.length < 6) {
      seats.push({
        name: 'Open seat',
        role: 'WAITING',
        icon: '＋',
        host: false,
        mic: false
      });
    }

    $('seatsGrid').innerHTML = seats.map(seat => `
      <div class="seat ${seat.host ? 'host' : ''}">
        <span class="seat-mic">${seat.mic ? '🎙️' : '🔇'}</span>
        <div class="seat-avatar">${seat.icon}</div>
        <div class="seat-name">${esc(seat.name)}</div>
        <div class="seat-role">${esc(seat.role)}</div>
      </div>
    `).join('');

    $('seatCount').textContent = '6';
    $('handBtn').textContent = handRaised ? '✋ Lower hand' : '✋ Raise hand';
  }

  function addChatMessage(name, message, gift = false, messageId = null) {
    const container = $('chatMessages');
    if (!container) return;

    // Realtime can deliver a message that we have just displayed after sending it.
    // Use the database ID to prevent duplicate bubbles.
    if (messageId && container.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`)) {
      return;
    }

    const el = document.createElement('div');
    el.className = 'chat-message';
    if (messageId) el.dataset.messageId = String(messageId);

    const who = document.createElement('strong');
    who.textContent = name;

    const text = document.createElement('p');
    text.textContent = message;

    if (gift) text.className = 'gift-text';

    el.append(who, text);
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function displayDatabaseMessage(row) {
    if (!row) return;
    const isMine = row.user_id === currentUser?.id;
    const name = isMine
      ? 'You'
      : `Member ${String(row.user_id || '').slice(0, 6)}`;
    addChatMessage(name, row.message, false, row.id);
  }

  async function stopRoomChat() {
    if (!chatChannel || !db()) return;
    const channel = chatChannel;
    chatChannel = null;
    try {
      await db().removeChannel(channel);
    } catch (error) {
      console.warn('[Party] Chat unsubscribe:', error);
    }
  }

  async function startRoomChat(roomId) {
    if (!db() || !currentUser || !roomId) return;

    await stopRoomChat();

    const roomIdForChannel = String(roomId);
    chatChannel = db()
      .channel(`voice-room-chat-${roomIdForChannel}-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'voice_room_messages',
        filter: `room_id=eq.${roomIdForChannel}`
      }, payload => {
        if (activeRoom && String(activeRoom.id) === roomIdForChannel) {
          displayDatabaseMessage(payload.new);
        }
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Party] Realtime chat status:', status);
          showNotice('Live chat connection failed. Check Supabase Realtime settings.');
        }
      });

    // Deliberately do not fetch old messages. Each visit starts with a clean chat;
    // participants who stayed in the room keep the messages already on their screen.
  }

  async function sendChat(event) {
    event.preventDefault();

    const input = $('chatInput');
    const message = input.value.trim();

    if (!message || !activeRoom) return;
    if (!currentUser || !isMember || !db()) {
      showNotice('Join the party and sign in before sending messages.');
      return;
    }

    const sendButton = $('chatForm')?.querySelector('[type="submit"]');
    if (sendButton) sendButton.disabled = true;

    try {
      const { data, error } = await db()
        .from('voice_room_messages')
        .insert({
          room_id: activeRoom.id,
          user_id: currentUser.id,
          message
        })
        .select('id,room_id,user_id,message,created_at')
        .single();

      if (error) throw error;
      displayDatabaseMessage(data);
      input.value = '';
      input.focus();
    } catch (error) {
      console.error('[Party] Send chat message:', error);
      showNotice(error.message || 'Message was not sent. Check your membership and Supabase policies.');
    } finally {
      if (sendButton) sendButton.disabled = false;
    }
  }

  async function toggleMicrophone() {
    if (!activeRoom || !isMember) {
      showNotice('Join a party first.');
      return;
    }
    if (!canTransmitRole()) {
      showNotice('Your seat is currently listener-only. Ask the host to approve your seat before speaking.');
      return;
    }
    if (micEnabled) {
      stopMicrophone();
      renderSeats();
      showNotice('Your microphone is muted.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      showNotice('Live audio needs a supported browser and a secure HTTPS page.');
      return;
    }
    if (audioStarting) return;
    audioStarting = true;
    try {
      $('micLabel').textContent = 'Requesting permission…';
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micEnabled = true;
      $('micBtn').classList.add('enabled');
      $('micIcon').textContent = '🎙️';
      $('micLabel').textContent = 'Mute my mic';
      // Attach the newly acquired microphone to any peers already connected.
      for (const pc of peerConnections.values()) {
        micStream.getAudioTracks().forEach(track => pc.addTrack(track, micStream));
      }
      await offerToRoomListeners();
      renderSeats();
      showNotice('Microphone is on. Connecting you to Party Room listeners…');
    } catch (error) {
      console.error('[Party] Microphone activation:', error);
      stopMicrophone();
      if (error.name === 'NotAllowedError') showNotice('Microphone permission was denied. Allow microphone access in your browser settings.');
      else showNotice(error.message || 'Could not start Party Room audio.');
    } finally {
      audioStarting = false;
    }
  }

  function toggleHand() {
    if (!activeRoom) return;

    handRaised = !handRaised;
    renderSeats();

    showNotice(handRaised
      ? 'You raised your hand. The host cannot yet receive a live notification.'
      : 'You lowered your hand.');
  }

  function showGiftDemo(button) {
    if (!activeRoom) return;

    const gift = button.dataset.gift;
    const cost = button.dataset.cost;

    $('giftNotice').textContent =
      `${gift} Gift preview (${cost} demo coins). No coins were spent or transferred.`;

    addChatMessage('You', `${gift} sent a demo gift!`, true);
  }

  async function leaveRoom() {
    stopMicrophone();
    await stopRoomAudio();
    await stopRoomChat();

    if (activeRoom && isMember && currentUser && db()) {
      try {
        if (isHost) {
          // Atomically hand the room to an in-room moderator, or end it and
          // remove every member if no moderator is present.
          const { data, error } = await db().rpc('owner_leave_voice_room', {
            p_room_id: activeRoom.id
          });
          if (error) throw error;
          if (data === 'transferred') {
            showNotice('You left the party. A room moderator is now the host.');
          } else if (data === 'ended') {
            showNotice('The host left and no moderator was present. The party has ended and everyone was removed.');
          } else if (data === 'not_owner') {
            showNotice('This room is no longer owned by you. Refreshing the party list.');
          }
        } else {
          const { error } = await db()
            .from('voice_room_members')
            .delete()
            .eq('room_id', activeRoom.id)
            .eq('user_id', currentUser.id);
          if (error) throw error;
        }
      } catch (error) {
        console.error('[Party] Leave room:', error);
        showNotice(error.message || 'Could not leave the party cleanly. Please try again.');
      }
    }

    activeRoom = null;
    isMember = false;
    isHost = false;
    handRaised = false;

    $('partyRoom').classList.add('hidden');
    $('lobby').classList.remove('hidden');

    await loadRooms();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('openCreate').addEventListener('click', async () => {
    if (!currentUser) {
      await getUser();
    }

    if (currentUser) {
      $('createModal').classList.remove('hidden');
      $('roomName').focus();
    } else {
      showNotice('Please sign in to FREE CHAT first.');
    }
  });

  $('closeCreate').addEventListener('click', () => {
    $('createModal').classList.add('hidden');
  });

  $('createModal').addEventListener('click', event => {
    if (event.target === $('createModal')) {
      $('createModal').classList.add('hidden');
    }
  });

  $('createForm').addEventListener('submit', createRoom);
  $('refreshBtn').addEventListener('click', loadRooms);
  $('chatForm').addEventListener('submit', sendChat);
  $('micBtn').addEventListener('click', toggleMicrophone);
  $('handBtn').addEventListener('click', toggleHand);
  $('requestSeatBtn')?.addEventListener('click', requestSeat);
  $('allowAnyoneSeat')?.addEventListener('change', changeOpenSeating);
  $('leaveRoom').addEventListener('click', leaveRoom);
  $('backToLobby').addEventListener('click', leaveRoom);

  $('giftBtn').addEventListener('click', () => {
    $('gift-panel')?.scrollIntoView({ behavior: 'smooth' });
    $('giftNotice').textContent =
      'Choose a demo gift below. Real coin transfers are not connected.';
    document.querySelector('.gift-panel').scrollIntoView({ behavior: 'smooth' });
  });

  document.querySelectorAll('.gift-btn').forEach(button => {
    button.addEventListener('click', () => showGiftDemo(button));
  });

  window.addEventListener('pagehide', () => { stopMicrophone(); stopRoomAudio(); });

  (async () => {
    await getUser();
    await loadRooms();
  })();
})();
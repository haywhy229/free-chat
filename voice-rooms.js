(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const db = () => window.supabaseClient;

  let currentUser = null;
  let rooms = [];
  let activeRoom = null;
  let micStream = null;
  let micEnabled = false;
  let voiceRewardHeartbeat = null;
  let voiceRewardSeconds = 0;
  let voiceRewardBusy = false;
  let handRaised = false;
  let isMember = false;
  let isHost = false;
  let chatChannel = null;
  let audioSignalChannel = null;
  let memberWatchChannel = null;
  let seatRequestWatchChannel = null;
  let peerConnections = new Map();
  const pendingIceCandidates = new Map();
  let processedSignalIds = new Set();
  let myRoomRole = 'listener';
  let remoteAudioElements = new Map();
  let audioStarting = false;
  let seatRequestStatus = null;
  let hostNames = new Map();
  let battleState = null; let battleTicker = null; let battleHideTimer = null; const seenBattleEvents = new Set(); const BATTLE_PREFIX='__FREECHAT_TEAM_BATTLE__'; const LUCKY777_PREFIX='__FREECHAT_777_DRAW__'; const DICE_ROLL_PREFIX='__FREECHAT_DICE_ROLL__'; const GAMEPK_PREFIX='__FREECHAT_GAME_PK__'; let gamePkState=null; let gamePkTicker=null; let gamePkHideTimer=null; const seenGamePkEvents=new Set(); const gamePkNames=new Map(); let gamePkNameFetchInFlight=false;

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

  async function flushPendingIceCandidates(peerId, pc) {
    const key = String(peerId);
    const queued = pendingIceCandidates.get(key) || [];
    pendingIceCandidates.delete(key);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn('[Party audio] Queued ICE candidate:', error.message); }
    }
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
        if (signal.payload) {
          if (pc?.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(signal.payload)); }
            catch (error) { console.warn('[Party audio] ICE candidate:', error.message); }
          } else {
            const queue = pendingIceCandidates.get(senderId) || [];
            queue.push(signal.payload);
            pendingIceCandidates.set(senderId, queue);
          }
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
        // Seat occupancy is derived from voice_room_members.role.
        await renderSeats();
        await updateMemberCount();
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
    if (voiceRewardHeartbeat) clearInterval(voiceRewardHeartbeat);
    voiceRewardHeartbeat = null;
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
        .select('id,name,topic,host_id,visibility,status,created_at,allow_anyone_seat,seat_capacity')
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
    const seatCapacity = Number($('roomCapacity')?.value || 6);

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
          status: 'active',
          seat_capacity: seatCapacity
        })
        .select('id,name,topic,host_id,visibility,status,created_at,allow_anyone_seat,seat_capacity')
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
          onConflict: 'room_id,user_id',
          ignoreDuplicates: true
        });

      if (error) throw error;

      activeRoom = room;
      await loadVoiceReward();
      isHost = room.host_id === currentUser.id;
      isMember = true;
      handRaised = false; battleState=null; if(battleTicker)clearInterval(battleTicker); if(battleHideTimer)clearTimeout(battleHideTimer); battleHideTimer=null; renderBattle();

      $('lobby').classList.add('hidden');
      $('partyRoom').classList.remove('hidden');

      $('activeRoomName').textContent = room.name;
      $('activeRoomTopic').textContent = room.topic || 'Meet and chat with everyone';
      seatRequestStatus = null;
      updateSeatControls();
      await loadModeratorPanel();
      await startSeatRequestWatch(room.id);

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
    const onStage = canTransmitRole();
    const status = $('seatRequestStatus');
    if (status) {
      status.textContent = onStage
        ? '🎤 You are on stage. Use the microphone button when you are ready to speak.'
        : '👂 You are listening. Tap an empty glowing seat to join the stage instantly.';
      status.classList.toggle('stage-status', onStage);
    }
    // Listeners must never see the stage microphone controls.
    const micButton = $('micBtn');
    const handButton = $('handBtn');
    if (micButton) micButton.classList.toggle('hidden', !onStage);
    if (handButton) handButton.classList.toggle('hidden', !onStage);
    const requestPanel = $('seatRequestsPanel');
    if (requestPanel) requestPanel.classList.add('hidden');
  }

  async function claimSeat() {
    if (!activeRoom || !currentUser || isHost) return;
    const wasAlreadyOnStage = canTransmitRole();
    try {
      const { data, error } = await db().rpc('claim_voice_room_seat', {
        p_room_id: activeRoom.id
      });
      if (error) throw error;
      if (data !== true) {
        showNotice('No open seats are available right now.');
        return;
      }
      myRoomRole = 'speaker';
      showNotice('You are on the stage! Turn on your microphone when you are ready.');
      if (!wasAlreadyOnStage) await startRoomAudio(activeRoom.id);
      await renderSeats();
      updateSeatControls();
    } catch (error) {
      console.error('[Party] Take seat:', error);
      showNotice(error.message || 'Could not take this seat. Please try again.');
    }
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
      if (decision === 'approved') {
        // The database function updates the member role and request status
        // atomically; do not separately update either table from the browser.
        const { data, error } = await db().rpc('approve_voice_room_seat_request', {
          p_request_id: requestId
        });
        if (error) throw error;
        if (data !== true) throw new Error('The database did not confirm the seat approval.');
      } else if (decision === 'rejected') {
        const { error } = await db().from('voice_room_seat_requests')
          .update({ status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', requestId)
          .eq('room_id', activeRoom.id)
          .eq('status', 'pending');
        if (error) throw error;
      } else {
        throw new Error('Unknown seat request decision.');
      }

      await Promise.all([
        loadSeatRequests(),
        renderSeats(),
        updateMemberCount()
      ]);
      showNotice(decision === 'approved'
        ? 'Seat approved. The member is now a speaker.'
        : 'Seat request rejected.');
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


  function closeMicSeatSheet() {
    document.getElementById('micSeatActionSheet')?.remove();
  }

  function openMicSeatSheet() {
    if (!activeRoom || !currentUser || !canTransmitRole() || isHost) return;
    closeMicSeatSheet();
    const sheet = document.createElement('div');
    sheet.id = 'micSeatActionSheet';
    sheet.className = 'mic-seat-sheet-backdrop';
    sheet.innerHTML = `
      <div class="mic-seat-sheet" role="dialog" aria-modal="true" aria-label="Microphone seat options">
        <button type="button" class="mic-seat-leave">Leave Mic</button>
        <button type="button" class="mic-seat-cancel">Cancel</button>
      </div>`;
    sheet.addEventListener('click', event => {
      if (event.target === sheet || event.target.closest('.mic-seat-cancel')) closeMicSeatSheet();
    });
    sheet.querySelector('.mic-seat-leave').addEventListener('click', leaveMicSeat);
    document.body.appendChild(sheet);
  }

  async function leaveMicSeat() {
    if (!activeRoom || !currentUser || !canTransmitRole()) return;
    const button = document.querySelector('.mic-seat-leave');
    if (button) { button.disabled = true; button.textContent = 'Leaving mic…'; }
    try {
      stopMicrophone();
      const { error } = await db().from('voice_room_members')
        .update({ role: 'listener' })
        .eq('room_id', activeRoom.id)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      myRoomRole = 'listener';
      handRaised = false;
      closeMicSeatSheet();
      updateSeatControls();
      await renderSeats();
      showNotice('You left the microphone seat. You are still in the party.');
    } catch (error) {
      console.error('[Party] Leave mic seat:', error);
      if (button) { button.disabled = false; button.textContent = 'Leave Mic'; }
      showNotice(error.message || 'Could not leave the microphone seat. Check the room member update policy.');
    }
  }

  async function renderSeats() {
    if (!activeRoom || !db()) return;
    try {
      const { data: members, error } = await db().from('voice_room_members')
        .select('user_id,role').eq('room_id', activeRoom.id).order('joined_at', { ascending: true });
      if (error) throw error;
      const rows = members || [];
      const ids = rows.map(m => m.user_id).filter(Boolean);
      const { data: profiles, error: profileError } = ids.length
        ? await db().from('profiles').select('id,username').in('id', ids)
        : { data: [], error: null };
      if (profileError) console.warn('[Party] Seat profiles:', profileError.message);
      const names = new Map((profiles || []).map(p => [String(p.id), p.username || 'FREE CHAT user']));
      const capacity = [6, 8, 12, 20].includes(Number(activeRoom.seat_capacity)) ? Number(activeRoom.seat_capacity) : 6;
      const seats = [{
        name: isHost ? 'You (Host)' : (names.get(String(activeRoom.host_id)) || 'Party Host'), userId: activeRoom.host_id,
        role: 'HOST', icon: '👑', host: true, mic: isHost ? micEnabled : false, occupied: true
      }];
      const speakers = rows.filter(m => String(m.user_id) !== String(activeRoom.host_id) &&
        ['speaker', 'moderator'].includes(String(m.role || '').toLowerCase()));
      for (const member of speakers) {
        const mine = String(member.user_id) === String(currentUser?.id);
        seats.push({
          name: mine ? 'You' : (names.get(String(member.user_id)) || 'FREE CHAT user'), userId: member.user_id,
          role: String(member.role).toUpperCase(), icon: mine ? '🙂' : '🎙️',
          host: false, mic: mine ? micEnabled : false, occupied: true
        });
      }
      while (seats.length < capacity) {
        const seatNumber = seats.length;
        seats.push({ name: `Open seat ${seatNumber}`, role: 'TAP TO JOIN',
          icon: '＋', host: false, mic: false, occupied: false });
      }
      $('seatsGrid').innerHTML = seats.slice(0, capacity).map((seat, index) => `
        <div class="seat ${seat.host ? 'host' : ''} ${seat.occupied ? '' : 'open-seat'} ${battleState?.teams?.[String(seat.userId)] || ''}-battle-seat"
             ${seat.occupied ? '' : `role="button" tabindex="0" data-open-seat="${index}" aria-label="Take open speaker seat ${index}"`}>
          <span class="seat-mic">${seat.mic ? '🎙️' : (seat.occupied ? '🔇' : '🎤')}</span>
          <div class="seat-avatar" ${!seat.host && String(seat.name) === 'You' ? 'data-my-stage-avatar="true" role="button" tabindex="0" aria-label="My microphone seat options"' : ''}>${seat.icon}</div>
          <div class="seat-name">${esc(seat.name)}</div>
          <div class="seat-role">${esc(seat.role)}</div>
        </div>`).join('');
      $('seatsGrid').querySelectorAll('[data-my-stage-avatar]').forEach(avatar => {
        avatar.addEventListener('click', openMicSeatSheet);
        avatar.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openMicSeatSheet();
          }
        });
      });
      const requestOpenSeat = () => claimSeat();
      $('seatsGrid').querySelectorAll('[data-open-seat]').forEach(seat => {
        seat.addEventListener('click', requestOpenSeat);
        seat.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); requestOpenSeat(); }
        });
      });
      $('seatCount').textContent = String(capacity);
      $('handBtn').textContent = handRaised ? '✋ Lower hand' : '✋ Raise hand';
    } catch (error) { console.error('[Party] Render seats:', error); }
  }

  async function startSeatRequestWatch(roomId) {
    if (!db() || !currentUser || !roomId) return;
    if (seatRequestWatchChannel) {
      await db().removeChannel(seatRequestWatchChannel).catch(() => {});
      seatRequestWatchChannel = null;
    }
    // Seats now update from membership role changes, not seat-request records.
    seatRequestWatchChannel = db()
      .channel(`party-stage-members-${roomId}-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'voice_room_members',
        filter: `room_id=eq.${roomId}`
      }, async () => {
        if (!activeRoom || String(activeRoom.id) !== String(roomId)) return;
        const { data: mine } = await db().from('voice_room_members')
          .select('role').eq('room_id', roomId)
          .eq('user_id', currentUser.id).maybeSingle();
        myRoomRole = mine?.role || 'listener';
        isHost = String(activeRoom.host_id) === String(currentUser.id);
        updateSeatControls();
        await renderSeats();
        await updateMemberCount();
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Party] Stage realtime status:', status);
        }
      });
  }

  async function stopSeatRequestWatch() {
    if (seatRequestWatchChannel && db()) {
      await db().removeChannel(seatRequestWatchChannel).catch(() => {});
    }
    seatRequestWatchChannel = null;
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

  function renderLucky777Message(row, payload) {
    const container = $('chatMessages');
    if (!container) return;
    if (row.id && container.querySelector(`[data-message-id="${CSS.escape(String(row.id))}"]`)) return;
    const card = document.createElement('div');
    card.className = 'chat-message lucky777-card';
    if (row.id) card.dataset.messageId = String(row.id);
    const who = document.createElement('strong');
    who.textContent = row.user_id === currentUser?.id ? 'You' : `Member ${String(row.user_id || '').slice(0, 6)}`;
    const label = document.createElement('div');
    label.className = 'lucky777-label';
    label.textContent = '🎰 777 NUMBER DRAW';
    const number = document.createElement('div');
    number.className = 'lucky777-number';
    number.setAttribute('aria-live', 'polite');
    number.textContent = '000';
    const caption = document.createElement('small');
    caption.className = 'lucky777-caption';
    caption.textContent = 'Just for fun';
    card.append(who, label, number, caption);
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;

    const finalNumber = String(Math.max(0, Math.min(999, Number(payload.number) || 0))).padStart(3, '0');
    const started = Date.now();
    const duration = 1900;
    const spin = () => {
      const elapsed = Date.now() - started;
      if (elapsed >= duration) {
        number.textContent = finalNumber;
        number.classList.remove('is-spinning');
        caption.textContent = `Result: ${finalNumber}`;
        return;
      }
      number.textContent = Array.from({length:3}, () => Math.floor(Math.random() * 10)).join('');
      number.classList.add('is-spinning');
      requestAnimationFrame(() => setTimeout(spin, 65));
    };
    spin();
  }

  function renderDiceRollMessage(row, payload) {
    const container = $('chatMessages');
    if (!container) return;
    if (row.id && container.querySelector(`[data-message-id="${CSS.escape(String(row.id))}"]`)) return;

    const finalValue = Math.max(1, Math.min(6, Math.floor(Number(payload.value) || 1)));
    const card = document.createElement('div');
    card.className = 'chat-message dice-roll-card';
    if (row.id) card.dataset.messageId = String(row.id);
    const who = document.createElement('strong');
    who.textContent = row.user_id === currentUser?.id ? 'You' : `Member ${String(row.user_id || '').slice(0, 6)}`;
    const title = document.createElement('div');
    title.className = 'dice-roll-title';
    title.textContent = '🎲 DICE ROLL';
    const stage = document.createElement('div');
    stage.className = 'dice-roll-stage';
    const die = document.createElement('div');
    die.className = 'dice-roll-cube is-rolling';
    die.setAttribute('aria-live', 'polite');
    const face = document.createElement('div');
    face.className = 'dice-roll-cube-face';
    for (let i = 0; i < 9; i++) {
      const pip = document.createElement('span');
      pip.className = 'dice-roll-pip';
      face.appendChild(pip);
    }
    die.appendChild(face);
    stage.appendChild(die);
    const result = document.createElement('div');
    result.className = 'dice-roll-result';
    result.textContent = 'Rolling…';
    card.append(who, title, stage, result);
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;

    const pipPositions = {
      1: [5], 2: [1, 9], 3: [1, 5, 9],
      4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
    };
    const setFace = value => {
      face.dataset.value = String(value);
      face.querySelectorAll('.dice-roll-pip').forEach((pip, index) => {
        const position = index + 1;
        pip.style.gridArea = `${Math.ceil(position / 3)} / ${((position - 1) % 3) + 1}`;
        pip.style.visibility = pipPositions[value].includes(position) ? 'visible' : 'hidden';
      });
    };
    setFace(5);
    const started = Date.now();
    const duration = 1500;
    let lastFace = -1;
    const spin = () => {
      const elapsed = Date.now() - started;
      if (elapsed >= duration) {
        setFace(finalValue);
        die.classList.remove('is-rolling');
        result.textContent = `${who.textContent} rolled ${finalValue}`;
        return;
      }
      let next = 1 + Math.floor(Math.random() * 6);
      if (next === lastFace) next = (next % 6) + 1;
      lastFace = next;
      setFace(next);
      requestAnimationFrame(() => setTimeout(spin, 85));
    };
    spin();
  }


  const fruitIcons=['🍓','🍋','🍇','🍊','🍉','🍒','🍍','🍌','🍎'];
  const fruitMultipliers={'🍉':45,'🍒':25,'🍇':15,'🍍':10,'🍓':3,'🍋':5,'🍊':5,'🍌':5,'🍎':5};
  let fruitRecentResults=[];
  let fruitMyScore=0, fruitRound=0, fruitHostTicker=null, fruitClockTicker=null;
  let fruitLiveState={status:'idle',round:0,startedAt:0,endsAt:0,choices:[],picks:{},scores:{},winner:null};
  let fruitHostTarget=null, fruitResultTimer=null;
  function openGameCentre(){ $('gameCentreModal')?.classList.remove('hidden'); }
  function closeFruitGame(){ $('fruitGameModal')?.classList.add('hidden'); }
  function fruitRoomScore(){return Object.values(fruitLiveState.scores||{}).reduce((sum,value)=>sum+(Number(value)||0),0);}
  async function hydrateFruitNames(){
    if(!db())return;
    const ids=Object.keys(fruitLiveState.scores||{}).filter(id=>id&&!gamePkNames.has(String(id)));
    if(!ids.length)return;
    try{const {data,error}=await db().from('profiles').select('id,username').in('id',ids);if(error)throw error;(data||[]).forEach(profile=>gamePkNames.set(String(profile.id),profile.username||'FREE CHAT user'));renderFruitLeaderboard();}
    catch(error){console.warn('[Fruit Arcade] Could not load player names:',error.message||error);}
  }
  function renderFruitLeaderboard(){
    const box=$('fruitLiveLeaderboard');if(!box)return;box.innerHTML='';
    const entries=Object.entries(fruitLiveState.scores||{}).sort((a,b)=>(Number(b[1])||0)-(Number(a[1])||0)).slice(0,8);
    if(!entries.length){box.textContent='No winners yet — pick a fruit to join the fun!';return;}
    entries.forEach(([id,score],index)=>{const row=document.createElement('div');row.className='fruit-live-row';const player=document.createElement('span');player.textContent=`${index+1}. ${gamePkName(id)}`;const points=document.createElement('b');points.textContent=`${Number(score)||0} pts`;row.append(player,points);box.appendChild(row);});
  }
  function renderFruitResults(){
    const box=$('fruitResultsHistory');if(!box)return;box.innerHTML='';
    if(!fruitRecentResults.length){box.innerHTML='<span>Waiting for first result…</span>';return;}
    fruitRecentResults.slice(0,12).forEach(item=>{
      const chip=document.createElement('span');chip.className='fruit-result-chip';
      chip.innerHTML=`<small>R${Number(item.round)||'?'}</small><b>${item.winner||'❔'}</b><em>×${Number(item.multiplier)||fruitMultipliers[item.winner]||1}</em>`;
      box.appendChild(chip);
    });
  }
  function renderFruitBoard(){
    const board=$('fruitBoard');if(!board)return;board.innerHTML='';
    const choices=fruitLiveState.choices?.length?fruitLiveState.choices:Array.from({length:9},(_,i)=>fruitIcons[i%fruitIcons.length]);
    const alreadyPicked=!!fruitLiveState.picks?.[String(currentUser?.id)];
    choices.forEach((icon,index)=>{
      const button=document.createElement('button');button.type='button';button.className='fruit-cell fruit-pick-cell';
      button.innerHTML=`<span class="fruit-icon">${icon}</span><span class="fruit-multiplier">×${fruitMultipliers[icon]||1}</span>`;
      button.setAttribute('aria-label',`Choose ${icon}`);
      if(alreadyPicked||fruitLiveState.status!=='running')button.disabled=true;
      if(alreadyPicked&&fruitLiveState.picks[String(currentUser.id)]===icon)button.classList.add('is-picked');
      button.addEventListener('click',async()=>{
        if(fruitLiveState.status!=='running'||fruitLiveState.picks?.[String(currentUser?.id)])return;
        button.classList.add('is-picked');
        board.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{await publishToolMessage(GAMEPK_PREFIX+JSON.stringify({type:'fruit-live-pick',round:fruitLiveState.round,userId:currentUser.id,fruit:icon}));$('fruitGameMessage').textContent=`You picked ${icon}. Good luck!`;}
        catch(error){board.querySelectorAll('button').forEach(b=>b.disabled=false);button.classList.remove('is-picked');showNotice(error.message||'Your fruit choice could not be sent.');}
      });
      board.appendChild(button);
    });
  }
  function updateFruitClock(){
    if(fruitLiveState.status!=='running')return;
    const left=Math.max(0,Math.ceil((fruitLiveState.endsAt-Date.now())/1000));
    if($('fruitGameClock'))$('fruitGameClock').textContent=String(left);
    if(left===0&&$('fruitGameMessage'))$('fruitGameMessage').textContent='Time is up! The fruit machine is spinning…';
  }
  function applyFruitLiveEvent(payload){
    if(payload.type==='fruit-live-round'){
      clearTimeout(fruitResultTimer);
      fruitLiveState={status:'running',round:Number(payload.round)||1,startedAt:Number(payload.startedAt)||Date.now(),endsAt:Number(payload.endsAt)||Date.now()+30000,choices:Array.isArray(payload.choices)?payload.choices:[],picks:{},scores:fruitLiveState.scores||{},winner:null};
      fruitRound=fruitLiveState.round;fruitMyScore=Number(fruitLiveState.scores?.[String(currentUser?.id)])||0;
      if($('fruitRound'))$('fruitRound').textContent=String(fruitRound);
      if($('fruitMyScore'))$('fruitMyScore').textContent=String(fruitMyScore);
      if($('fruitRoomScore'))$('fruitRoomScore').textContent=String(fruitRoomScore());
      fruitRecentResults=Array.isArray(payload.recentResults)?payload.recentResults.slice(0,12):fruitRecentResults;
      renderFruitResults();
      if($('fruitTarget'))$('fruitTarget').textContent='❔';
      if($('fruitMachineStatus'))$('fruitMachineStatus').textContent='PICK YOUR FRUIT';
      if($('fruitGameMessage'))$('fruitGameMessage').textContent='Choose one fruit before the 30-second countdown ends.';
      renderFruitBoard();renderFruitLeaderboard();updateFruitClock();
      if(fruitClockTicker)clearInterval(fruitClockTicker);fruitClockTicker=setInterval(updateFruitClock,250);
    }else if(payload.type==='fruit-live-pick'){
      if(Number(payload.round)!==fruitLiveState.round||fruitLiveState.status!=='running'||!payload.userId||!fruitIcons.includes(payload.fruit))return;
      fruitLiveState.picks=fruitLiveState.picks||{};
      if(!fruitLiveState.picks[String(payload.userId)])fruitLiveState.picks[String(payload.userId)]=payload.fruit;
      if(String(payload.userId)===String(currentUser?.id))renderFruitBoard();
    }else if(payload.type==='fruit-live-result'){
      if(Number(payload.round)!==fruitLiveState.round)return;
      fruitLiveState.status='result';fruitLiveState.winner=payload.winner;fruitLiveState.scores=payload.scores||fruitLiveState.scores||{};
      fruitMyScore=Number(fruitLiveState.scores[String(currentUser?.id)])||0;
      if(fruitClockTicker)clearInterval(fruitClockTicker);fruitClockTicker=null;
      if($('fruitGameClock'))$('fruitGameClock').textContent='00';
      if($('fruitTarget'))$('fruitTarget').textContent=payload.winner||'❔';
      fruitRecentResults=[{round:fruitLiveState.round,winner:payload.winner,multiplier:fruitMultipliers[payload.winner]||1},...(fruitRecentResults||[])].slice(0,12);
      renderFruitResults();
      if($('fruitMachineStatus'))$('fruitMachineStatus').textContent='WINNING FRUIT';
      if($('fruitMyScore'))$('fruitMyScore').textContent=String(fruitMyScore);
      if($('fruitRoomScore'))$('fruitRoomScore').textContent=String(fruitRoomScore());
      const picked=fruitLiveState.picks?.[String(currentUser?.id)];
      const won=picked===payload.winner;
      if($('fruitGameMessage'))$('fruitGameMessage').textContent=won?`🎉 You picked the winning fruit! +${fruitMultipliers[payload.winner]||1} points`:`The winning fruit is ${payload.winner}. Next round starts shortly!`;
      $('fruitBoard')?.querySelectorAll('button').forEach(button=>{button.disabled=true;if(button.querySelector('.fruit-icon')?.textContent===payload.winner)button.classList.add('is-hit');});
      renderFruitLeaderboard();hydrateFruitNames();
    }
  }
  async function publishFruitHostEvent(payload){
    if(!await refreshRoomHostStatus())throw new Error('The room host must stay in the party to run the live fruit game.');
    await publishToolMessage(GAMEPK_PREFIX+JSON.stringify(payload));
  }
  async function finishFruitLiveRound(){
    if(!isHost||fruitLiveState.status!=='running')return;
    const winner=fruitHostTarget||fruitIcons[Math.floor(Math.random()*fruitIcons.length)];
    const scores={...(fruitLiveState.scores||{})};
    Object.entries(fruitLiveState.picks||{}).forEach(([userId,pick])=>{if(pick===winner)scores[userId]=(Number(scores[userId])||0)+(fruitMultipliers[winner]||1);});
    await publishFruitHostEvent({type:'fruit-live-result',round:fruitLiveState.round,winner,scores,finishedAt:Date.now()});
    fruitHostTarget=null;
    clearTimeout(fruitResultTimer);
    fruitResultTimer=setTimeout(()=>startFruitLiveRound().catch(error=>showNotice(error.message||'The next fruit round could not start.')),3500);
  }
  async function startFruitLiveRound(){
    if(!activeRoom||!isMember)return;
    if(!await refreshRoomHostStatus())return;
    const choices=[...fruitIcons].sort(()=>Math.random()-.5);
    fruitHostTarget=fruitIcons[Math.floor(Math.random()*fruitIcons.length)];
    const now=Date.now();
    await publishFruitHostEvent({type:'fruit-live-round',round:(Number(fruitLiveState.round)||0)+1,startedAt:now,endsAt:now+30000,choices,recentResults:fruitRecentResults});
  }
  function startFruitHostLoop(){
    if(fruitHostTicker)clearInterval(fruitHostTicker);
    fruitHostTicker=setInterval(()=>{
      if(fruitLiveState.status==='running'&&Date.now()>=fruitLiveState.endsAt&&isHost)finishFruitLiveRound().catch(error=>showNotice(error.message||'Could not settle this round.'));
    },300);
  }
  async function openFruitGame(){
    if(!activeRoom||!isMember){showNotice('Join the party before playing.');return;}
    if(gamePkState?.status==='running'&&gamePkState.game!=='Fruit turntable'){showNotice(`The active Game PK is ${gamePkState.game}. Choose that game from Game Centre when it is available.`);return;}
    $('gameCentreModal')?.classList.add('hidden');$('fruitGameModal')?.classList.remove('hidden');
    if($('fruitRoomScore'))$('fruitRoomScore').textContent=String(fruitRoomScore());
    if($('fruitMyScore'))$('fruitMyScore').textContent=String(Number(fruitLiveState.scores?.[String(currentUser?.id)])||0);
    if(fruitLiveState.status==='idle'||fruitLiveState.status==='result'){
      if(isHost){try{await startFruitLiveRound();}catch(error){showNotice(error.message||'Could not start the live fruit game.');}}
      else if($('fruitGameMessage'))$('fruitGameMessage').textContent='Waiting for the room host to start the live fruit machine…';
    }else{renderFruitBoard();updateFruitClock();}
    startFruitHostLoop();renderFruitLeaderboard();
    if($('fruitStartButton')){$('fruitStartButton').textContent='LIVE GAME · AUTO ROUND';$('fruitStartButton').disabled=true;}
  }

  function gamePkName(id){
    if(id===currentUser?.id)return 'You';
    return gamePkNames.get(String(id)) || `Member ${String(id||'').slice(0,6)}`;
  }
  async function hydrateGamePkNames(){
    if(!db()||!gamePkState||gamePkNameFetchInFlight)return;
    const ids=Object.keys(gamePkState.scores||{}).filter(id=>id && !gamePkNames.has(String(id)));
    if(!ids.length)return;
    gamePkNameFetchInFlight=true;
    try{
      const {data,error}=await db().from('profiles').select('id,username').in('id',ids);
      if(error)throw error;
      (data||[]).forEach(profile=>gamePkNames.set(String(profile.id),profile.username||'FREE CHAT user'));
      const card=document.querySelector('.gamepk-card[data-gamepk-live="1"]');
      if(card)updateGamePkCard(card,gamePkState);
      renderFruitLeaderboard();
    }catch(error){console.warn('[Game PK] Could not load player names:',error.message||error);}
    finally{gamePkNameFetchInFlight=false;}
  }
  function renderFruitLeaderboard(){
    const box=$('fruitLiveLeaderboard');if(!box)return;
    const entries=Object.entries(gamePkState?.scores||{}).sort((a,b)=>(Number(b[1])||0)-(Number(a[1])||0)).slice(0,5);
    box.innerHTML='';
    if(!entries.length){box.textContent='No room scores yet';return;}
    entries.forEach(([id,score],index)=>{
      const row=document.createElement('div');row.className='fruit-live-row';
      const player=document.createElement('span');player.textContent=`${index+1}. ${gamePkName(id)}`;
      const points=document.createElement('b');points.textContent=String(Number(score)||0);
      row.append(player,points);box.appendChild(row);
    });
  }
  function renderGamePkCard(row,payload){
    const box=$('chatMessages'); if(!box)return;
    if(row?.id && box.querySelector(`[data-message-id="${CSS.escape(String(row.id))}"]`))return;
    const card=document.createElement('div'); card.className='chat-message gamepk-card'; if(row?.id)card.dataset.messageId=String(row.id);
    card.innerHTML='<div class="gpk-head"><span>🏆 GAME PK</span><span class="gpk-timer">--:--</span></div><div class="gpk-game"></div><div class="gpk-scores"></div><div class="gpk-status"></div>';
    box.appendChild(card); box.scrollTop=box.scrollHeight;
    updateGamePkCard(card,payload);
  }
  function updateGamePkCard(card,state){
    if(!card||!state)return;
    card.querySelector('.gpk-game').textContent=`${state.game||'Game'} · ${state.duration||0} minutes`;
    const timer=card.querySelector('.gpk-timer');
    if(state.status==='running'){
      const left=Math.max(0,Math.ceil((state.expiresAt-Date.now())/1000));
      timer.textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
    }else timer.textContent=state.status==='ended'?'00:00':'READY';
    const scores=card.querySelector('.gpk-scores'); scores.innerHTML='';
    const entries=Object.entries(state.scores||{}).sort((a,b)=>b[1]-a[1]);
    if(!entries.length)scores.textContent='No scores yet';
    entries.forEach(([id,score],i)=>{const row=document.createElement('div');row.className='gpk-row';const name=document.createElement('span');name.textContent=`${i+1}. ${gamePkName(id)}`;const val=document.createElement('b');val.className='gpk-score';val.textContent=String(score);row.append(name,val);scores.appendChild(row);});
    card.querySelector('.gpk-status').textContent=state.status==='running'?'Live · Gift points count while the PK is running.':state.status==='ended'?`Final result: ${state.winner?gamePkName(state.winner)+' wins':'Draw'}.`:'Waiting to start';
    let playButton=card.querySelector('.gpk-play');
    if(state.status==='running' && !playButton){playButton=document.createElement('button');playButton.type='button';playButton.className='gpk-play';playButton.textContent='🎮 Play game';playButton.addEventListener('click',()=>openFruitGame());card.appendChild(playButton);}
    if(state.status!=='running')playButton?.remove();
    let endButton=card.querySelector('.gpk-end');
    if(isHost&&state.status==='running'&&!endButton){endButton=document.createElement('button');endButton.type='button';endButton.className='gpk-end';endButton.textContent='End Game PK';endButton.addEventListener('click',()=>endGamePk().catch(e=>showNotice(e.message)));card.appendChild(endButton);}
    if(state.status!=='running')endButton?.remove();
    card.classList.toggle('is-ended',state.status==='ended');
  }
  function applyGamePkEvent(payload){
    if(!payload||!payload.type)return;
    if(String(payload.type).startsWith('fruit-live-')){applyFruitLiveEvent(payload);return;}
    if(payload.type==='setup'){
      gamePkState={id:payload.id,game:payload.game,duration:payload.duration,status:'running',startedAt:payload.startedAt,expiresAt:payload.expiresAt,scores:payload.scores||{}};
      clearTimeout(gamePkHideTimer);
    }else if(payload.type==='score'&&gamePkState?.status==='running'){
      if(payload.gameId && payload.gameId!==gamePkState.id)return;
      gamePkState.scores=gamePkState.scores||{};gamePkState.scores[payload.userId]=(gamePkState.scores[payload.userId]||0)+Math.max(0,Number(payload.points)||0);
    }else if(payload.type==='end'&&gamePkState){
      gamePkState.status='ended';gamePkState.winner=payload.winner||null;
    }else return;
    let card=document.querySelector('.gamepk-card[data-gamepk-live="1"]');
    if(!card){card=document.createElement('div');card.className='chat-message gamepk-card';card.dataset.gamepkLive='1';card.innerHTML='<div class="gpk-head"><span>🏆 GAME PK</span><span class="gpk-timer">--:--</span></div><div class="gpk-game"></div><div class="gpk-scores"></div><div class="gpk-status"></div>';$('chatMessages')?.appendChild(card);}
    updateGamePkCard(card,gamePkState);
    if($('fruitRoomScore'))$('fruitRoomScore').textContent=String(fruitRoomScore());
    renderFruitLeaderboard();
    hydrateGamePkNames();
    if(gamePkState.status==='ended'){if(gamePkTicker)clearInterval(gamePkTicker);gamePkTicker=null;gamePkHideTimer=setTimeout(()=>card.remove(),15000);}
    else startGamePkTicker();
  }
  // Always verify host ownership against the current database row before
  // starting or controlling a room game. The lobby room object can be stale.
  async function refreshRoomHostStatus(){
    if(!activeRoom || !currentUser || !db()) {
      isHost = false;
      return false;
    }
    const {data: freshRoom, error} = await db()
      .from('voice_rooms')
      .select('id,host_id')
      .eq('id', activeRoom.id)
      .maybeSingle();
    if(error) {
      console.warn('[Game Centre] Could not refresh room host:', error);
      isHost = false;
      return false;
    }
    if(!freshRoom) {
      isHost = false;
      return false;
    }
    activeRoom = {...activeRoom, ...freshRoom};
    isHost = String(freshRoom.host_id) === String(currentUser.id);
    updateSeatControls();
    return isHost;
  }

  async function publishGamePkEvent(payload){
    if(!activeRoom||!currentUser||!isMember||!db())throw new Error('Join a party first.');
    if(!await refreshRoomHostStatus())throw new Error('Only the room host can control Game PK. The room host account does not match the signed-in account.');
    await publishToolMessage(GAMEPK_PREFIX+JSON.stringify(payload));
  }
  function startGamePkTicker(){
    if(gamePkTicker)clearInterval(gamePkTicker);
    gamePkTicker=setInterval(async()=>{
      if(!gamePkState||gamePkState.status!=='running')return;
      const card=document.querySelector('.gamepk-card[data-gamepk-live="1"]');updateGamePkCard(card,gamePkState);
      if(Date.now()>=gamePkState.expiresAt&&isHost){
        const entries=Object.entries(gamePkState.scores||{}).sort((a,b)=>b[1]-a[1]);
        const winner=entries.length&&entries[0][1]>(entries[1]?.[1]??-1)?entries[0][0]:null;
        try{await publishGamePkEvent({type:'end',winner});}catch(e){showNotice(e.message||'Could not finish Game PK.');}
      }
    },1000);
  }
  async function openGamePkSetup(){
    if(!await refreshRoomHostStatus()){showNotice('Only the room host can start Game PK. Check which account created this party.');return;}
    $('gamePkSetupModal')?.classList.remove('hidden');
  }
  async function endGamePk(){
    if(!isHost||gamePkState?.status!=='running'){showNotice('There is no active Game PK to end.');return;}
    const entries=Object.entries(gamePkState.scores||{}).sort((a,b)=>b[1]-a[1]);
    const winner=entries.length&&entries[0][1]>(entries[1]?.[1]??-1)?entries[0][0]:null;
    await publishGamePkEvent({type:'end',winner});
  }

  function displayDatabaseMessage(row) {
    if (!row) return;
    if (typeof row.message === 'string' && row.message.startsWith(GAMEPK_PREFIX)) {
      try { const event=JSON.parse(row.message.slice(GAMEPK_PREFIX.length)); if(!row.id||!seenGamePkEvents.has(row.id)){if(row.id)seenGamePkEvents.add(row.id);applyGamePkEvent(event);} } catch(e){console.warn('[Game PK] Invalid event:',e);}
      return;
    }
    if (typeof row.message === 'string' && row.message.startsWith(DICE_ROLL_PREFIX)) {
      try { renderDiceRollMessage(row, JSON.parse(row.message.slice(DICE_ROLL_PREFIX.length))); } catch(e) { console.warn('[Dice] Invalid roll message:', e); }
      return;
    }
    if (typeof row.message === 'string' && row.message.startsWith(BATTLE_PREFIX)) { try { applyBattleEvent(JSON.parse(row.message.slice(BATTLE_PREFIX.length))); } catch(e) { console.warn(e); } return; }
    if (typeof row.message === 'string' && row.message.startsWith(LUCKY777_PREFIX)) {
      try { renderLucky777Message(row, JSON.parse(row.message.slice(LUCKY777_PREFIX.length))); } catch(e) { console.warn('[777] Invalid draw message:', e); }
      return;
    }
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

  function ensureVoiceRewardCard() {
    if (!$('voiceRewardCard') && $('micBtn')) {
      const card = document.createElement('div');
      card.id = 'voiceRewardCard';
      card.className = 'voice-reward-card';
      card.innerHTML = '<div class="voice-reward-head">🎁 DAILY VOICE REWARD <b id="voiceRewardCoins">10,000 coins</b></div><div class="voice-reward-track"><span id="voiceRewardFill"></span></div><div class="voice-reward-foot"><span id="voiceRewardTime">0:00 / 15:00</span><span id="voiceRewardStatus">Turn on your mic to earn</span></div>';
      $('micBtn').insertAdjacentElement('afterend', card);
    }
  }

  function renderVoiceReward(progress = 0, claimed = false) {
    ensureVoiceRewardCard();
    const pct = Math.min(100, Math.round(progress / 900 * 100));
    if ($('voiceRewardFill')) $('voiceRewardFill').style.width = pct + '%';
    if ($('voiceRewardTime')) $('voiceRewardTime').textContent = `${Math.floor(progress/60)}:${String(progress%60).padStart(2,'0')} / 15:00`;
    if ($('voiceRewardStatus')) $('voiceRewardStatus').textContent = claimed ? 'Daily reward received!' : (micEnabled ? 'Mic is on — keep going!' : 'Turn on your mic to earn');
  }

  async function syncVoiceReward() {
    if (!currentUser || !activeRoom || !micEnabled || voiceRewardBusy) return;
    voiceRewardBusy = true;
    try {
      const { data, error } = await db().rpc('fc_voice_reward_heartbeat', { p_room_id: activeRoom.id });
      if (error) throw error;
      if (data) renderVoiceReward(Number(data.progress_seconds || 0), !!data.claimed);
    } catch (e) { console.warn('[Rewards] Heartbeat:', e.message); }
    finally { voiceRewardBusy = false; }
  }

  async function loadVoiceReward() {
    ensureVoiceRewardCard();
    if (!currentUser) return;
    try {
      const { data, error } = await db().rpc('fc_voice_reward_status');
      if (error) throw error;
      if (data) renderVoiceReward(Number(data.progress_seconds || 0), !!data.claimed);
    } catch (e) { console.warn('[Rewards] Status:', e.message); }
  }

  async function toggleMicrophone() {
    if (!activeRoom || !isMember) {
      showNotice('Join a party first.');
      return;
    }
    if (!canTransmitRole()) {
      showNotice('You are listening. Tap an empty seat to join the stage before speaking.');
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
      await syncVoiceReward();
      if (voiceRewardHeartbeat) clearInterval(voiceRewardHeartbeat);
      voiceRewardHeartbeat = setInterval(syncVoiceReward, 30000);
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

  async function publishBattleEvent(event) {
    event = { ...event, eventId: (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`) };
    if (!activeRoom || !currentUser || !isMember || !db()) throw new Error('Join the party first.');
    if(['setup','start','end'].includes(event.type) && !await refreshRoomHostStatus()) {
      throw new Error('Only the room host can control Team Battle. Check which account created this party.');
    }
    const {error}=await db().from('voice_room_messages').insert({room_id:activeRoom.id,user_id:currentUser.id,message:BATTLE_PREFIX+JSON.stringify(event)});
    if(error) throw error; applyBattleEvent(event);
  }
  function applyBattleEvent(e) {
    if(e.eventId && seenBattleEvents.has(e.eventId)) return; if(e.eventId) seenBattleEvents.add(e.eventId);
    if(e.type==='setup'){if(battleHideTimer)clearTimeout(battleHideTimer);battleHideTimer=null;battleState={status:'preparing',mode:+e.mode,duration:+e.duration,red:0,blue:0,teams:{},expiresAt:null};}
    else if(!battleState) return;
    else if(e.type==='team'){battleState.teams[String(e.userId)]=e.team; renderSeats().catch(()=>{});}
    else if(e.type==='start'){battleState.status='running';battleState.expiresAt=+e.expiresAt;}
    else if(e.type==='score') battleState[e.team]=Math.max(0,(battleState[e.team]||0)+(+e.points||0));
    else if(e.type==='end'){battleState.status='ended';battleState.winner=e.winner;}
    renderBattle();
    if(e.type==='end'){if(battleHideTimer)clearTimeout(battleHideTimer);battleHideTimer=setTimeout(()=>{if(battleState?.status==='ended'){battleState=null;renderBattle();renderSeats().catch(()=>{});}battleHideTimer=null;},6000);}
  }
  function renderBattle(){
    const p=$('teamBattlePanel'); if(!p)return; p.classList.toggle('hidden',!battleState); if(!battleState)return;
    $('redScore').textContent=battleState.red||0; $('blueScore').textContent=battleState.blue||0;
    $('battleStatus').textContent=battleState.status==='running'?'Battle in progress':battleState.status==='preparing'?`${battleState.mode}V${battleState.mode} · Preparing`:battleState.winner==='cancelled'?'Battle ended · CANCELLED':`Battle ended · ${battleState.winner==='draw'?'DRAW':String(battleState.winner||'').toUpperCase()+' TEAM WINS'}`;
    $('battleHostActions').classList.toggle('hidden',!isHost||battleState.status!=='preparing');
    const teamActions=$('teamBattlePanel').querySelector('.battle-team-actions'); if(teamActions)teamActions.classList.toggle('hidden',battleState.status==='ended');
    const endBtn=$('battleEnd'); if(endBtn){endBtn.classList.toggle('hidden',!isHost||battleState.status==='ended');}
    const hint=$('battleHint'); if(hint&&battleState.status==='ended'){hint.textContent=battleState.winner==='cancelled'?'Battle cancelled. This result will close shortly.':`Final score — Red ${battleState.red||0} : ${battleState.blue||0} Blue. ${battleState.winner==='draw'?'It is a draw.':String(battleState.winner||'').toUpperCase()+' team wins.'}`;}
    if(battleTicker)clearInterval(battleTicker);
    const tick=()=>{if(battleState?.status!=='running'){$('battleClock').textContent=battleState?.status==='preparing'?`${battleState.duration}:00`:'00:00';return;}let n=Math.max(0,Math.ceil((battleState.expiresAt-Date.now())/1000));$('battleClock').textContent=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;if(!n&&isHost)finishBattle();}; tick();if(battleState.status==='running')battleTicker=setInterval(tick,1000);
  }
  async function finishBattle(){
    if(!battleState||!['preparing','running'].includes(battleState.status)) return;
    if(!await refreshRoomHostStatus()){
      showNotice('Only the room owner can end Team Battle. Check which account created this party.');
      return;
    }
    const w=battleState.status==='preparing'?'cancelled':(battleState.red===battleState.blue?'draw':battleState.red>battleState.blue?'red':'blue');
    try{await publishBattleEvent({type:'end',winner:w});}
    catch(e){showNotice(e.message||'Could not end Team Battle.');}
  }
  async function openBattleSetup(){if(!await refreshRoomHostStatus()){showNotice('Only the room owner can start Team Battle. Check which account created this party.');return;}$('battleSetupModal').classList.remove('hidden');}
  async function chooseBattleTeam(team){if(!battleState||battleState.status==='ended'){showNotice('The host has not prepared a battle yet.');return;}try{await publishBattleEvent({type:'team',userId:currentUser.id,team});}catch(e){showNotice(e.message);}}
  async function startBattle(){if(battleState?.status!=='preparing')return;try{if(!await refreshRoomHostStatus())throw new Error('Only the room host can start Team Battle.');await publishBattleEvent({type:'start',expiresAt:Date.now()+battleState.duration*60000});}catch(e){showNotice(e.message);}}

  function showGiftDemo(button) {
    if (!activeRoom) return;

    const gift = button.dataset.gift;
    const cost = button.dataset.cost;

    $('giftNotice').textContent =
      `${gift} Gift preview (${cost} demo coins). No coins were spent or transferred.`;

    addChatMessage('You', `${gift} sent a demo gift!`, true);
    const team=battleState?.teams?.[String(currentUser?.id)]; if(battleState?.status==='running'&&team) publishBattleEvent({type:'score',team,points:Number(cost)}).catch(e=>showNotice(e.message)); else if(battleState?.status==='running') showNotice('Join a team before sending gifts for battle points.'); if(gamePkState?.status==='running'&&canTransmitRole()) publishToolMessage(GAMEPK_PREFIX+JSON.stringify({type:'score',userId:currentUser.id,points:Math.max(1,Number(cost)||1)})).catch(e=>showNotice(e.message));
  }

  async function leaveRoom() {
    if(gamePkTicker)clearInterval(gamePkTicker); gamePkTicker=null; gamePkState=null; clearTimeout(gamePkHideTimer);
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

    await stopSeatRequestWatch();
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
  document.querySelectorAll('[data-conversation-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const selected = button.dataset.conversationTab;
      document.querySelectorAll('[data-conversation-tab]').forEach(tab =>
        tab.classList.toggle('active', tab === button));
      const announcement = $('roomAnnouncement');
      const messages = $('chatMessages');
      if (announcement) announcement.classList.toggle('tab-hidden', selected === 'chat');
      if (messages) messages.classList.toggle('room-tab-hidden', selected === 'room');
      if (selected === 'chat') $('chatInput')?.focus();
      if (selected === 'room') announcement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
  $('chatGiftShortcut')?.addEventListener('click', () => {
    const panel = document.querySelector('.gift-panel');
    panel?.classList.toggle('gifts-open');
    if (panel?.classList.contains('gifts-open')) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  // Party Tools: room-wide actions are published through the existing live chat table.
  const toolsBackdrop = $('toolsBackdrop');
  const closeTools = () => { toolsBackdrop?.classList.add('hidden'); toolsBackdrop?.setAttribute('aria-hidden', 'true'); };
  $('toolsBtn')?.addEventListener('click', () => { toolsBackdrop?.classList.remove('hidden'); toolsBackdrop?.setAttribute('aria-hidden', 'false'); });
  $('closeTools')?.addEventListener('click', closeTools);
  toolsBackdrop?.addEventListener('click', event => { if (event.target === toolsBackdrop) closeTools(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeTools(); });
  let partyAudioMuted = false;
  let partyEffectTimer = null;

  async function publishToolMessage(message) {
    if (!activeRoom || !currentUser || !isMember || !db()) throw new Error('Join a party before using this tool.');
    const { data, error } = await db().from('voice_room_messages').insert({
      room_id: activeRoom.id, user_id: currentUser.id, message
    }).select('id,room_id,user_id,message,created_at').single();
    if (error) throw error;
    displayDatabaseMessage(data);
  }

  function showPartyEffect(kind) {
    const old = document.getElementById('partyToolEffect'); old?.remove();
    const overlay = document.createElement('div'); overlay.id = 'partyToolEffect';
    overlay.textContent = kind === 'gift' ? '🎁 ✨ 🎉' : '✨ 🌟 ✨';
    Object.assign(overlay.style, {position:'fixed',inset:'18% 0 auto',zIndex:'99999',textAlign:'center',fontSize:'54px',pointerEvents:'none',filter:'drop-shadow(0 4px 12px #ff4fd8)',animation:'partyToolPop 1.4s ease both'});
    document.body.appendChild(overlay); clearTimeout(partyEffectTimer); partyEffectTimer=setTimeout(()=>overlay.remove(),1500);
  }

  toolsBackdrop?.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', async () => {
    const tool = button.dataset.tool, feedback = $('toolsFeedback');
    const say = message => { if (feedback) feedback.textContent = message; };
    try {
      if (tool === 'roomgift' || tool === 'lucky') {
        closeTools(); document.querySelector('.gift-panel')?.classList.add('gifts-open');
        if ($('giftNotice')) $('giftNotice').textContent = tool === 'lucky' ? 'Lucky Bag: choose a gift to display in the room.' : 'Choose a room gift.';
        document.querySelector('.gift-panel')?.scrollIntoView({behavior:'smooth',block:'center'});
      } else if (tool === 'textchat') { closeTools(); document.querySelector('[data-conversation-tab="chat"]')?.click(); $('chatInput')?.focus();
      } else if (tool === 'share') {
        const shareData={title:'FREE CHAT Live Party',text:`Join my party: ${activeRoom?.name || 'Live Party'}`,url:location.href};
        if(navigator.share) await navigator.share(shareData); else if(navigator.clipboard){await navigator.clipboard.writeText(location.href);say('Party link copied.');} else say('Sharing is not supported on this device.');
      } else if (tool === 'clear') {
        if(window.confirm('Clear messages only from your screen? Other members will keep their messages.')) $('chatMessages').innerHTML='<div class="system-message">Chat view cleared on this device.</div>';
        say('Your chat view was cleared.');
      } else if (tool === 'mute') {
        partyAudioMuted=!partyAudioMuted; remoteAudioElements.forEach(audio=>{audio.muted=partyAudioMuted;});
        button.querySelector('b').textContent=partyAudioMuted?'Unmute':'Mute'; button.querySelector('span').textContent=partyAudioMuted?'🔇':'🔊'; say(partyAudioMuted?'Other participants are muted on this device.':'Participant audio is unmuted.');
      } else if (tool === 'calculate') {
        const expression=window.prompt('Enter a calculation (example: 12*5):');
        if(expression!==null){if(!/^[0-9+*/().%\s-]+$/.test(expression)) say('Use numbers and basic math operators only.'); else {try{const result=Function('"use strict";return ('+expression+')')();say(Number.isFinite(result)?`${expression} = ${result}`:'That calculation is not valid.');}catch{say('That calculation is not valid.');}}}
      } else if (tool === 'dice') {
        closeTools();
        const value = 1 + Math.floor(Math.random() * 6);
        await publishToolMessage(`${DICE_ROLL_PREFIX}${JSON.stringify({value, createdAt: new Date().toISOString()})}`);
        say(`🎲 Rolling one die… everyone in the room will see the same result.`);
      } else if (tool === 'mora') {
        const choices=['✊ Rock','✋ Paper','✌️ Scissors']; const move=choices[Math.floor(Math.random()*3)]; await publishToolMessage(`✊ Mora challenge! ${currentUser.user_metadata?.username || 'A member'} chose ${move}. Reply in chat with your move.`); say('Your Mora move was shared with the room.');
      } else if (tool === '777') {
        closeTools();
        const number = Math.floor(Math.random() * 1000);
        await publishToolMessage(`${LUCKY777_PREFIX}${JSON.stringify({number, createdAt: new Date().toISOString()})}`);
        say('🎰 Your 777 number is rolling!');
      } else if (tool === 'gamecentre') {
        closeTools(); openGameCentre();
      } else if (tool === 'gamepk' || tool === 'battle') {
        if(tool==='battle'){closeTools();openBattleSetup();return;}
        closeTools(); openGamePkSetup();
      } else if (tool === 'gathering') {
        await publishToolMessage(`🔔 Party gathering! ${currentUser.user_metadata?.username || 'A member'} invites everyone to join the conversation.`); say('Gathering invitation sent to everyone in this room.');
      } else if (tool === 'roommode') {
        if(!isHost){say('Only the host can change room mode.');return;}
        const next=activeRoom.visibility==='public'?'private':'public';
        if(!window.confirm(`Change this party to ${next.toUpperCase()}?`)) return;
        const {error}=await db().from('voice_rooms').update({visibility:next}).eq('id',activeRoom.id).eq('host_id',currentUser.id);
        if(error) throw error; activeRoom.visibility=next; await publishToolMessage(`🏠 The host changed this party to ${next}.`); say(`Party is now ${next}.`);
      } else if (tool === 'gifteffect' || tool === 'entryeffect') {
        showPartyEffect(tool==='gifteffect'?'gift':'entry'); await publishToolMessage(tool==='gifteffect'?'✨ Gift effect!':'🌟 Entry effect!'); say('Effect shown on your screen and announced in the room.');
      } else if (tool === 'music') {
        say('Shared music playback needs a room audio-stream feature; this project does not yet have one, so no fake play button was added.');
      }
    } catch(error) { console.error('[Party tools]',error); say(error.message || 'This tool could not be completed.'); }
  }));

  $('closeGameCentre')?.addEventListener('click',()=>$('gameCentreModal')?.classList.add('hidden'));
  $('gameCentreModal')?.addEventListener('click',e=>{if(e.target===$('gameCentreModal'))$('gameCentreModal').classList.add('hidden');});
  document.querySelectorAll('[data-launch-game]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.launchGame==='Fruit turntable')openFruitGame();}));
  document.querySelectorAll('[data-coming-game]').forEach(button=>button.addEventListener('click',()=>showNotice(`${button.dataset.comingGame} is queued for the next Game Centre build. Fruit Turntable is playable now.`)));
  $('closeFruitGame')?.addEventListener('click',closeFruitGame);
  $('fruitGameModal')?.addEventListener('click',e=>{if(e.target===$('fruitGameModal'))closeFruitGame();});
  $('fruitStartButton')?.addEventListener('click',()=>showNotice('Fruit rounds run automatically every 30 seconds. Pick one fruit on the board to join.'));
  $('closeGamePkSetup')?.addEventListener('click',()=>$('gamePkSetupModal')?.classList.add('hidden'));
  $('confirmGamePkSetup')?.addEventListener('click',async()=>{
    try{
      if(!await refreshRoomHostStatus())throw new Error('Only the room host can start Game PK. Check which account created this party.');
      if(gamePkState?.status==='running')throw new Error('A Game PK is already running.');
      const game=$('gamePkGame').value,duration=Number($('gamePkDuration').value);
      const now=Date.now();
      await publishGamePkEvent({type:'setup',id:`${activeRoom.id}-${now}`,game,duration,startedAt:now,expiresAt:now+duration*60000,scores:{}});
      $('gamePkSetupModal').classList.add('hidden');
      showNotice(`${game} Game PK started for ${duration} minutes.`);
    }catch(e){showNotice(e.message||'Could not start Game PK.');}
  });
  $('gamePkSetupModal')?.addEventListener('click',e=>{if(e.target===$('gamePkSetupModal'))$('gamePkSetupModal').classList.add('hidden');});
  $('closeBattleSetup')?.addEventListener('click',()=>$('battleSetupModal').classList.add('hidden'));
  $('confirmBattleSetup')?.addEventListener('click',async()=>{try{await publishBattleEvent({type:'setup',mode:+$('battleMode').value,duration:+$('battleDuration').value});$('battleSetupModal').classList.add('hidden');}catch(e){showNotice(e.message);}});
  $('joinRed')?.addEventListener('click',()=>chooseBattleTeam('red')); $('joinBlue')?.addEventListener('click',()=>chooseBattleTeam('blue')); $('battleStart')?.addEventListener('click',startBattle); $('battleEnd')?.addEventListener('click',finishBattle);
  document.querySelectorAll('[data-battle-tab]').forEach(btn=>btn.addEventListener('click',()=>{const target=btn.dataset.battleTab;document.querySelectorAll('[data-battle-tab]').forEach(b=>b.classList.toggle('active',b===btn));document.querySelector(`[data-conversation-tab="${target==='all'?'room':'chat'}"]`)?.click();}));
  $('micBtn').addEventListener('click', toggleMicrophone);
  $('handBtn').addEventListener('click', toggleHand);
  $('leaveRoom').addEventListener('click', leaveRoom);
  $('backToLobby').addEventListener('click', leaveRoom);

  $('giftBtn').addEventListener('click', () => {
    document.querySelector('.gift-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('giftNotice').textContent =
      'Choose a demo gift below. Real coin transfers are not connected.';
    document.querySelector('.gift-panel').scrollIntoView({ behavior: 'smooth' });
  });

  document.querySelectorAll('.gift-btn').forEach(button => {
    button.addEventListener('click', () => showGiftDemo(button));
  });

  window.addEventListener('pagehide', () => { stopMicrophone(); stopRoomAudio(); stopSeatRequestWatch(); if(fruitHostTicker)clearInterval(fruitHostTicker); if(fruitClockTicker)clearInterval(fruitClockTicker); clearTimeout(fruitResultTimer); });

  (async () => {
    await getUser();
    await loadRooms();
  })();
})();

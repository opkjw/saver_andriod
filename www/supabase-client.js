/**
 * Supabase 클라이언트 초기화
 *
 * 사용 전 아래 두 값을 Supabase 프로젝트의 실제 값으로 교체하세요:
 *   1. Supabase 대시보드 → Project Settings → API
 *   2. SUPABASE_URL: https://<project-ref>.supabase.co
 *   3. SUPABASE_ANON_KEY: eyJ... (anon/public key)
 */

(function () {
  // ── 설정값 ────────────────────────────────────────────────────────────
  var SUPABASE_URL = 'https://urtcsfgcjqognbxzqgnb.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVydGNzZmdjanFvZ25ieHpxZ25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxOTAxNzQsImV4cCI6MjA5NDc2NjE3NH0.Ypb6cUFbL-MDkseuGby-sOH74SAyyoV0ToIDaE8Ur0E';
  // ─────────────────────────────────────────────────────────────────────

  // supabase.umd.js가 window.supabase 로 노출됨
  var script = document.createElement('script');
  script.src = 'supabase.umd.js';
  script.onload = function () {
    if (!window.supabase) return;
    window.SupabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,   // Capacitor에서 URL 기반 OAuth 미사용
        },
        realtime: {
          params: { eventsPerSecond: 10 },
        },
      }
    );
    console.log('[Supabase] 클라이언트 초기화 완료');
    document.dispatchEvent(new CustomEvent('supabase:ready'));
  };
  document.head.appendChild(script);
})();

var SB = {
  /** DB role → 앱 role 변환 (parent→user, coach→admin) */
  mapRole: function (dbRole) {
    if (dbRole === 'parent') return 'user';
    if (dbRole === 'coach') return 'admin';
    return dbRole || 'user';
  },

  /** 현재 로그인 세션 반환 */
  getSession: async function () {
    if (!window.SupabaseClient) return null;
    var { data } = await window.SupabaseClient.auth.getSession();
    return data.session;
  },

  /** Google OAuth URL 반환 — 브라우저에서 열어야 함 */
  getGoogleOAuthUrl: async function () {
    var client = window.SupabaseClient;
    if (!client) throw new Error('Supabase 미초기화');
    var { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'savermatrix://auth',
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    return data.url;
  },

  /** 초대 코드로 현재 유저의 팀+역할 설정 (Google 로그인 후 호출) */
  applyInviteCode: async function (inviteCode) {
    var client = window.SupabaseClient;
    if (!client) throw new Error('Supabase 미초기화');
    var code = inviteCode.toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new Error('올바르지 않은 초대 코드 형식입니다');
    var { data, error } = await client.rpc('apply_invite_code', { p_code: code });
    if (error) throw new Error('초대 코드 처리 오류: ' + error.message);
    if (data && data.error) throw new Error(data.error);
    return { role: data.role, teamId: data.teamId };
  },


  /** 현재 사용자 프로필 조회 (role, team_id 포함) */
  getProfile: async function () {
    var client = window.SupabaseClient;
    if (!client) return null;
    var { data: sessData } = await client.auth.getSession();
    if (!sessData || !sessData.session) return null;
    var { data, error } = await client.from('profiles')
      .select('id, role, team_id, nickname, player_no')
      .eq('id', sessData.session.user.id)
      .maybeSingle();
    if (error) { console.warn('[Supabase] getProfile 오류', error); return null; }
    return data;
  },

  /** 로그아웃 */
  signOut: async function () {
    if (!window.SupabaseClient) return;
    await window.SupabaseClient.auth.signOut();
  },

  _channel: null,

  /** Realtime 구독 시작
   *  onGameUpdate(gameRow)        — games UPDATE 이벤트
   *  onRecordInsert(table, row)   — bat_log/pit_bf/pit_runs INSERT (null 이면 미구독)
   */
  startRealtime: function (teamId, onGameUpdate, onRecordInsert, onBroadcastReceive) {
    var client = window.SupabaseClient;
    if (!client || !teamId) return;
    SB.stopRealtime();
    var ch = client.channel('team-' + teamId);
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'team_id=eq.' + teamId },
      function (payload) { if (onGameUpdate) onGameUpdate(payload.new); });
    if (onRecordInsert) {
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bat_log', filter: 'team_id=eq.' + teamId },
        function (payload) { onRecordInsert('bat_log', payload.new); });
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bat_log', filter: 'team_id=eq.' + teamId },
        function (payload) { onRecordInsert('bat_log_update', payload.new); });
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pit_bf', filter: 'team_id=eq.' + teamId },
        function (payload) { onRecordInsert('pit_bf', payload.new); });
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pit_runs', filter: 'team_id=eq.' + teamId },
        function (payload) { onRecordInsert('pit_runs', payload.new); });
    }
    if (onBroadcastReceive) {
      ch.on('broadcast', { event: 'game_state' }, function (payload) {
        if (payload && payload.payload) onBroadcastReceive(payload.payload);
      });
    }
    ch.subscribe(function (status) { console.log('[Realtime]', status); });
    SB._channel = ch;
  },

  /** 현재 베이스/이닝 상태를 채널에 브로드캐스트 */
  broadcastGameState: function (state) {
    if (!SB._channel) return;
    SB._channel.send({ type: 'broadcast', event: 'game_state', payload: state })
      .catch(function (e) { console.warn('[Realtime broadcast]', e); });
  },

  /** Realtime 구독 해제 */
  stopRealtime: function () {
    if (SB._channel && window.SupabaseClient) {
      window.SupabaseClient.removeChannel(SB._channel);
      SB._channel = null;
      console.log('[Realtime] 구독 해제');
    }
  },

  /** 팀 데이터 fetch — DB 필드를 앱 필드로 매핑 */
  fetchTeamData: async function (teamId) {
    var client = window.SupabaseClient;
    if (!client) throw new Error('Supabase 미초기화');
    var results = await Promise.all([
      client.from('games').select('*').eq('team_id', teamId).order('date', { ascending: false }),
      client.from('bat_log').select('*').eq('team_id', teamId),
      client.from('pit_bf').select('*').eq('team_id', teamId),
      client.from('pit_runs').select('*').eq('team_id', teamId),
      client.from('players').select('*').eq('team_id', teamId).order('no'),
      client.from('teams').select('name').eq('id', teamId).maybeSingle(),
    ]);
    var gamesRaw = results[0].data || [];
    var batLogRaw = results[1].data || [];
    var pitBfRaw = results[2].data || [];
    var pitRunsRaw = results[3].data || [];
    var rosterRaw = results[4].data || [];
    var teamName = (results[5].data && results[5].data.name) || '';

    var games = gamesRaw.map(function (g) {
      return { id: g.id, date: g.date, opp: g.opponent, type: g.type || 'R', no: g.game_no || 1, status: g.status };
    });
    var bat_log = batLogRaw.map(function (e) {
      return { id: e.id, gid: e.game_id, pno: e.player_no, oc: e.oc, zone: e.zone, run: e.run || 0, rbi: e.rbi || 0, sb: e.sb || 0, cs: e.cs || 0 };
    });
    var pit_bf = pitBfRaw.map(function (e) {
      return { id: e.id, gid: e.game_id, pno: e.player_no, oc: e.oc };
    });
    var pit_runs = pitRunsRaw.map(function (e) {
      return { id: e.id, gid: e.game_id, pno: e.player_no, earned: e.earned !== false };
    });
    var roster = rosterRaw.map(function (p) {
      return { no: p.no, name: p.name, r: p.role || 'b', pos: p.pos || '', siblings: p.siblings || [] };
    });

    return { games: games, bat_log: bat_log, pit_bf: pit_bf, pit_runs: pit_runs, roster: roster, teamName: teamName };
  },

  /** 경기 upsert — 앱 필드를 DB 필드로 매핑 */
  upsertGame: async function (game, teamId) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    var row = {
      id: game.id,
      team_id: teamId,
      date: game.date,
      opponent: game.opp,
      status: game.status || 'active',
      type: game.type || 'R',
      game_no: game.no || 1,
    };
    var { error } = await client.from('games').upsert(row);
    if (error) console.warn('[SB] upsertGame 오류', error);
  },

  /** 경기 삭제 */
  deleteGame: async function (gid) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    var { error } = await client.from('games').delete().eq('id', gid);
    if (error) console.warn('[SB] deleteGame 오류', error);
  },

  /** bat_log 배치 upsert */
  upsertBatLog: async function (entries, teamId) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    if (!entries || !entries.length) return;
    var rows = entries.map(function (e) {
      return { id: e.id, team_id: teamId, game_id: e.gid, player_no: e.pno, oc: e.oc, zone: e.zone, run: e.run, rbi: e.rbi, sb: e.sb, cs: e.cs };
    });
    var { error } = await client.from('bat_log').upsert(rows);
    if (error) console.warn('[SB] upsertBatLog 오류', error);
  },

  /** bat_log 단건 삭제 */
  deleteBatLog: async function (id) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    var { error } = await client.from('bat_log').delete().eq('id', id);
    if (error) console.warn('[SB] deleteBatLog 오류', error);
  },

  /** pit_bf 배치 upsert */
  upsertPitBf: async function (entries, teamId) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    if (!entries || !entries.length) return;
    var rows = entries.map(function (e) {
      return { id: e.id, team_id: teamId, game_id: e.gid, player_no: e.pno, oc: e.oc };
    });
    var { error } = await client.from('pit_bf').upsert(rows);
    if (error) console.warn('[SB] upsertPitBf 오류', error);
  },

  /** pit_bf 단건 삭제 */
  deletePitBf: async function (id) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    var { error } = await client.from('pit_bf').delete().eq('id', id);
    if (error) console.warn('[SB] deletePitBf 오류', error);
  },

  /** pit_runs 배치 upsert */
  upsertPitRuns: async function (entries, teamId) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    if (!entries || !entries.length) return;
    var rows = entries.map(function (e) {
      return { id: e.id, team_id: teamId, game_id: e.gid, player_no: e.pno, earned: e.earned };
    });
    var { error } = await client.from('pit_runs').upsert(rows);
    if (error) console.warn('[SB] upsertPitRuns 오류', error);
  },

  /** pit_runs 단건 삭제 */
  deletePitRun: async function (id) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    var { error } = await client.from('pit_runs').delete().eq('id', id);
    if (error) console.warn('[SB] deletePitRun 오류', error);
  },

  /** 선수 명단 배치 upsert */
  upsertRoster: async function (players, teamId) {
    var client = window.SupabaseClient;
    if (!client) return;
    if (window.PERM && window.PERM.parent) return;
    if (!players || !players.length) return;
    var rows = players.map(function (p) {
      return { team_id: teamId, no: p.no, name: p.name, role: p.r || 'b', pos: p.pos || null, siblings: p.siblings || [] };
    });
    var { error } = await client.from('players').upsert(rows, { onConflict: 'team_id,no,role' });
    if (error) console.warn('[SB] upsertRoster 오류', error);
  },
};

window.SB = SB;

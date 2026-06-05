import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import type { Messaging } from 'firebase/messaging';

// Types
export interface Player {
  name: string;
  number: number;
  position: string;
}

export interface Team {
  id: string;
  leagueId: string;
  name: string;
  color: string;
  captainUid: string;
  captainEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  players: Player[];
  code?: string;
  flagCode?: string;
}

export interface LeagueSettings {
  id: string;
  name: string;
  teamCount: number;
  wPoints: number;
  dPoints: number;
  lPoints: number;
  status: 'setup' | 'registration' | 'active' | 'knockout' | 'finished';
  currentRound: number;
  totalRounds: number;
  championId?: string | null;
}

export interface Match {
  id: string;
  leagueId: string;
  round: number | 'SF1' | 'SF2' | 'FINAL';
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isCompleted: boolean;
  submittedBy: 'captain' | 'admin' | null;
  isDisputed: boolean;
  proposedHomeScore?: number | null;
  proposedAwayScore?: number | null;
  scoreStatus?: 'pending_approval' | 'approved' | null;
  roomCode?: string | null;
}

export interface AppUser {
  uid: string;
  email: string;
  role: 'admin' | 'viewer';
  teamId?: string | null;
}

// Timeout Helper to prevent WebSocket hangs on wrong configuration
const withTimeout = <T>(
  promise: Promise<T>, 
  timeoutMs = 5000, 
  errorMsg = 'Database connection timed out. Please check your network connection or Firebase database URL in .env.'
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
    )
  ]);
};

// Firebase configuration from environment
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if Firebase config is complete
const isFirebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.databaseURL &&
  firebaseConfig.projectId
);

let app;
let db: ReturnType<typeof getFirestore> | null = null;
let messaging: Messaging | null = null;
let useFirebase = false;

const forceMock = localStorage.getItem('scores_force_mock_db') === 'true';

if (isFirebaseConfigured && !forceMock) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      messaging = getMessaging(app);
    }
    useFirebase = true;
    console.log('Scores: Firestore initialized successfully.');
    
    // Seed admin credentials into Firestore if not present (wrapped in timeout)
    const adminRef = doc(db, 'config', 'admin_credentials');
    withTimeout(getDoc(adminRef), 3000)
      .then((snapshot) => {
        if (!snapshot.exists()) {
          withTimeout(setDoc(adminRef, {
            email: 'admin@scores.com',
            password: 'adminpassword'
          }), 3000).catch(err => {
            console.warn("Could not seed admin credentials to Firestore:", err);
          });
        }
      })
      .catch(err => {
        console.warn("Could not check admin credentials in Firestore (timed out/failed):", err);
      });
  } catch (error) {
    console.error('Scores: Firestore initialization failed. Falling back to Mock mode.', error);
    useFirebase = false;
  }
} else {
  if (forceMock) {
    console.log('Scores: Forced Local Mock mode via localStorage.');
  } else {
    console.log('Scores: No Firebase credentials found. Running in Local Mock mode.');
  }
}

// Local Storage Keys
const LS_ACTIVE_LEAGUE_ID = 'scores_active_league_id';
const LS_LEAGUES = 'scores_leagues';
const LS_TEAMS = 'scores_teams';
const LS_FIXTURES = 'scores_fixtures';
const LS_USERS = 'scores_users';
const LS_CURRENT_USER = 'scores_current_user';

// Mock DB Initializer
const initMockDB = () => {
  if (!localStorage.getItem(LS_USERS)) {
    // Seed default admin account
    const defaultUsers: Record<string, AppUser & { password?: string }> = {
      'admin-uid-123': {
        uid: 'admin-uid-123',
        email: 'admin@scores.com',
        role: 'admin',
        password: 'adminpassword'
      }
    };
    localStorage.setItem(LS_USERS, JSON.stringify(defaultUsers));
  }
  if (!localStorage.getItem(LS_ACTIVE_LEAGUE_ID)) {
    localStorage.setItem(LS_ACTIVE_LEAGUE_ID, JSON.stringify(null));
  }
  if (!localStorage.getItem(LS_LEAGUES)) {
    localStorage.setItem(LS_LEAGUES, JSON.stringify({}));
  }
  if (!localStorage.getItem(LS_TEAMS)) {
    localStorage.setItem(LS_TEAMS, JSON.stringify({}));
  }
  if (!localStorage.getItem(LS_FIXTURES)) {
    localStorage.setItem(LS_FIXTURES, JSON.stringify({}));
  }
};

if (!useFirebase) {
  initMockDB();
}

// Listeners Registry for Local State Sync
type ListenerCallback<T> = (data: T) => void;
const leaguesListeners = new Set<ListenerCallback<Record<string, LeagueSettings>>>();
const activeLeagueIdListeners = new Set<ListenerCallback<string | null>>();
const teamsListeners = new Set<ListenerCallback<Record<string, Team>>>();
const fixturesListeners = new Set<ListenerCallback<Match[]>>();
const authListeners = new Set<ListenerCallback<AppUser | null>>();

let cachedUser: AppUser | null = null;
// Always load the user from localStorage on startup regardless of mode
const cachedUserStr = localStorage.getItem(LS_CURRENT_USER);
if (cachedUserStr) {
  cachedUser = JSON.parse(cachedUserStr);
}

// Exported Functions

// Auth Services
export const subscribeToAuth = (callback: ListenerCallback<AppUser | null>) => {
  authListeners.add(callback);
  callback(cachedUser);
  return () => {
    authListeners.delete(callback);
  };
};

export const signIn = async (email: string, password: string): Promise<AppUser> => {
  if (useFirebase && db) {
    let isValid = false;
    
    // Check default credentials immediately to prevent database hangs
    if (email.toLowerCase() === 'admin@scores.com' && password === 'adminpassword') {
      isValid = true;
    } else {
      try {
        // Try to verify against Firestore document with timeout
        const adminRef = doc(db, 'config', 'admin_credentials');
        const snapshot = await withTimeout(getDoc(adminRef), 3000);
        if (snapshot.exists()) {
          const adminCreds = snapshot.data();
          if (
            adminCreds &&
            adminCreds.email.toLowerCase() === email.toLowerCase() &&
            adminCreds.password === password
          ) {
            isValid = true;
          }
        } else {
          // Document doesn't exist, try to seed it
          await withTimeout(setDoc(adminRef, {
            email: 'admin@scores.com',
            password: 'adminpassword'
          }), 3000);
          if (email.toLowerCase() === 'admin@scores.com' && password === 'adminpassword') {
            isValid = true;
          }
        }
      } catch (err) {
        console.warn("Firestore credentials check failed, using hardcoded fallback:", err);
        // Hardcoded fallback in case database rules block unauthenticated reads
        if (email.toLowerCase() === 'admin@scores.com' && password === 'adminpassword') {
          isValid = true;
        }
      }
    }

    if (isValid) {
      const userDetails: AppUser = {
        uid: 'admin-uid-123',
        email: email,
        role: 'admin',
        teamId: null
      };
      localStorage.setItem(LS_CURRENT_USER, JSON.stringify(userDetails));
      cachedUser = userDetails;
      authListeners.forEach(cb => cb(userDetails));
      return userDetails;
    }
    throw new Error('Invalid email or password.');
  } else {
    // Mock Auth
    const usersStr = localStorage.getItem(LS_USERS) || '{}';
    const users = JSON.parse(usersStr);
    const foundUser = Object.values(users).find(
      (u: any) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    ) as any;

    if (foundUser) {
      const userDetails: AppUser = {
        uid: foundUser.uid,
        email: foundUser.email,
        role: foundUser.role,
        teamId: foundUser.teamId || null
      };
      localStorage.setItem(LS_CURRENT_USER, JSON.stringify(userDetails));
      cachedUser = userDetails;
      authListeners.forEach(cb => cb(userDetails));
      return userDetails;
    }
    throw new Error('Invalid email or password.');
  }
};

export const signUp = async (
  _email: string, 
  _password: string
): Promise<AppUser> => {
  // Sign up is disabled as only admin needs access and admin credentials are pre-configured
  throw new Error('Registration is disabled. Admin credentials are pre-configured.');
};

export const signOut = async () => {
  localStorage.removeItem(LS_CURRENT_USER);
  cachedUser = null;
  authListeners.forEach(cb => cb(null));
};

// Database Mode Switcher helpers
export { isFirebaseConfigured, db, messaging };
export const getDatabaseMode = () => useFirebase ? 'firebase' : 'mock';

export const toggleDatabaseMode = () => {
  const currentMode = useFirebase;
  if (currentMode) {
    localStorage.setItem('scores_force_mock_db', 'true');
  } else {
    localStorage.removeItem('scores_force_mock_db');
  }
  window.location.reload();
};

// Unified Database Operation Wrapper with self-healing auto fallback
const runDbOperation = async <T>(
  firebaseOp: () => Promise<T>,
  mockOp: () => Promise<T>,
  opName = 'Database operation'
): Promise<T> => {
  if (useFirebase && db) {
    try {
      return await withTimeout(firebaseOp(), 3500, `${opName} timed out.`);
    } catch (err) {
      console.warn(`${opName} failed on Firebase. Automatically falling back to Local Mock Database:`, err);
      useFirebase = false;
      localStorage.setItem('scores_force_mock_db', 'true');
      
      // Schedule page reload so active listeners re-subscribe to local storage sync
      setTimeout(() => {
        window.location.reload();
      }, 800);
      
      return await mockOp();
    }
  } else {
    return await mockOp();
  }
};

// Database Services

// 1. Active League ID
export const getActiveLeagueId = async (): Promise<string | null> => {
  return runDbOperation(
    async () => {
      const snapshot = await getDoc(doc(db!, 'config', 'activeLeague'));
      return snapshot.exists() ? (snapshot.data()?.leagueId as string) : null;
    },
    async () => {
      const id = localStorage.getItem(LS_ACTIVE_LEAGUE_ID);
      return id ? JSON.parse(id) : null;
    },
    'Get active league ID'
  );
};

export const saveActiveLeagueId = async (leagueId: string | null) => {
  return runDbOperation(
    async () => {
      await setDoc(doc(db!, 'config', 'activeLeague'), { leagueId });
    },
    async () => {
      localStorage.setItem(LS_ACTIVE_LEAGUE_ID, JSON.stringify(leagueId));
      triggerActiveLeagueIdListeners();
      triggerLeaguesListeners();
    },
    'Save active league ID'
  );
};

// 2. League Operations
export const getLeagues = async (): Promise<Record<string, LeagueSettings>> => {
  return runDbOperation(
    async () => {
      const querySnapshot = await getDocs(collection(db!, 'leagues'));
      const leagues: Record<string, LeagueSettings> = {};
      querySnapshot.forEach((doc) => {
        leagues[doc.id] = doc.data() as LeagueSettings;
      });
      return leagues;
    },
    async () => {
      const leaguesStr = localStorage.getItem(LS_LEAGUES) || '{}';
      return JSON.parse(leaguesStr);
    },
    'Get leagues list'
  );
};

export const saveLeagueSettings = async (leagueId: string, settings: Partial<LeagueSettings>) => {
  return runDbOperation(
    async () => {
      await setDoc(doc(db!, 'leagues', leagueId), settings, { merge: true });
    },
    async () => {
      const leagues = await getLeagues();
      const current = leagues[leagueId] || {
        id: leagueId,
        name: '',
        teamCount: 4,
        wPoints: 3,
        dPoints: 1,
        lPoints: 0,
        status: 'setup',
        currentRound: 1,
        totalRounds: 0,
        championId: null
      };
      leagues[leagueId] = { ...current, ...settings } as LeagueSettings;
      localStorage.setItem(LS_LEAGUES, JSON.stringify(leagues));
      triggerLeaguesListeners();
    },
    'Save league settings'
  );
};

// 3. Team Operations
export const getTeams = async (): Promise<Record<string, Team>> => {
  return runDbOperation(
    async () => {
      const querySnapshot = await getDocs(collection(db!, 'teams'));
      const teams: Record<string, Team> = {};
      querySnapshot.forEach((doc) => {
        teams[doc.id] = doc.data() as Team;
      });
      return teams;
    },
    async () => {
      const teamsStr = localStorage.getItem(LS_TEAMS) || '{}';
      return JSON.parse(teamsStr);
    },
    'Get teams list'
  );
};

export const updateTeam = async (teamId: string, teamData: Partial<Team>) => {
  return runDbOperation(
    async () => {
      await setDoc(doc(db!, 'teams', teamId), teamData, { merge: true });
    },
    async () => {
      const teams = await getTeams();
      if (teams[teamId]) {
        teams[teamId] = { ...teams[teamId], ...teamData } as Team;
      } else {
        teams[teamId] = teamData as Team;
      }
      localStorage.setItem(LS_TEAMS, JSON.stringify(teams));
      triggerTeamsListeners();
    },
    'Update team'
  );
};

export const approveOrRejectTeam = async (teamId: string, status: 'approved' | 'rejected' | 'pending') => {
  await updateTeam(teamId, { status });
};

// Public 2-Player Team Creation and Joining
export const publicCreateTeam = async (
  leagueId: string, 
  teamName: string, 
  color: string, 
  player: Player,
  flagCode?: string
): Promise<{ teamId: string; code: string }> => {
  const teamId = `team-${Date.now()}`;
  const code = Math.random().toString(36).substring(2, 7).toUpperCase(); // e.g. "7X9KW"
  const newTeam: Team = {
    id: teamId,
    leagueId,
    name: teamName,
    color,
    captainUid: '',
    captainEmail: '',
    status: 'pending',
    players: [player],
    code: code,
    flagCode: flagCode || ''
  };

  await runDbOperation(
    async () => {
      await setDoc(doc(db!, 'teams', teamId), newTeam);
    },
    async () => {
      const teams = await getTeams();
      teams[teamId] = newTeam;
      localStorage.setItem(LS_TEAMS, JSON.stringify(teams));
      triggerTeamsListeners();
    },
    'Create team profile'
  );
  return { teamId, code };
};

export const publicJoinTeam = async (
  code: string, 
  player: Player
): Promise<{ teamId: string; code: string }> => {
  return runDbOperation(
    async () => {
      // Find team by code in Firestore
      const querySnapshot = await getDocs(collection(db!, 'teams'));
      let targetTeamDoc: any = null;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.code && data.code.toUpperCase() === code.trim().toUpperCase()) {
          targetTeamDoc = { id: doc.id, ...data };
        }
      });

      if (!targetTeamDoc) throw new Error('Invalid team code.');
      if (targetTeamDoc.players.length >= 2) throw new Error('This team is already full (maximum 2 players).');

      const updatedPlayers = [...targetTeamDoc.players, player];
      const teamRef = doc(db!, 'teams', targetTeamDoc.id);
      await setDoc(teamRef, { players: updatedPlayers }, { merge: true });
      return { teamId: targetTeamDoc.id, code: code.trim().toUpperCase() };
    },
    async () => {
      const teams = await getTeams();
      const targetTeam = Object.values(teams).find(
        (t) => t.code && t.code.toUpperCase() === code.trim().toUpperCase()
      );

      if (!targetTeam) throw new Error('Invalid team code.');
      if (targetTeam.players.length >= 2) throw new Error('This team is already full (maximum 2 players).');

      targetTeam.players.push(player);
      localStorage.setItem(LS_TEAMS, JSON.stringify(teams));
      triggerTeamsListeners();
      return { teamId: targetTeam.id, code: code.trim().toUpperCase() };
    },
    'Join team roster'
  );
};

// 4. Fixtures Operations
export const getFixtures = async (leagueId: string): Promise<Match[]> => {
  return runDbOperation(
    async () => {
      const snapshot = await getDoc(doc(db!, 'fixtures', leagueId));
      return snapshot.exists() ? (snapshot.data()?.matches as Match[]) : [];
    },
    async () => {
      const fixturesStr = localStorage.getItem(LS_FIXTURES) || '{}';
      const allFixtures = JSON.parse(fixturesStr);
      return allFixtures[leagueId] || [];
    },
    'Get fixtures list'
  );
};

export const saveFixtures = async (leagueId: string, fixtures: Match[]) => {
  return runDbOperation(
    async () => {
      await setDoc(doc(db!, 'fixtures', leagueId), { matches: fixtures });
    },
    async () => {
      const fixturesStr = localStorage.getItem(LS_FIXTURES) || '{}';
      const allFixtures = JSON.parse(fixturesStr);
      allFixtures[leagueId] = fixtures;
      localStorage.setItem(LS_FIXTURES, JSON.stringify(allFixtures));
      triggerFixturesListeners(leagueId);
    },
    'Save fixtures list'
  );
};

export const updateMatchScore = async (
  leagueId: string,
  matchId: string, 
  homeScore: number, 
  awayScore: number, 
  submittedBy: 'captain' | 'admin'
) => {
  const fixtures = await getFixtures(leagueId);
  const index = fixtures.findIndex(m => m.id === matchId);
  if (index !== -1) {
    if (submittedBy === 'captain') {
      fixtures[index] = {
        ...fixtures[index],
        proposedHomeScore: homeScore,
        proposedAwayScore: awayScore,
        scoreStatus: 'pending_approval',
        isCompleted: false,
        submittedBy,
        isDisputed: false
      };
    } else {
      fixtures[index] = {
        ...fixtures[index],
        homeScore,
        awayScore,
        proposedHomeScore: homeScore,
        proposedAwayScore: awayScore,
        scoreStatus: 'approved',
        isCompleted: true,
        submittedBy,
        isDisputed: false
      };
    }

    await runDbOperation(
      async () => {
        await setDoc(doc(db!, 'fixtures', leagueId), { matches: fixtures });
      },
      async () => {
        const fixturesStr = localStorage.getItem(LS_FIXTURES) || '{}';
        const allFixtures = JSON.parse(fixturesStr);
        allFixtures[leagueId] = fixtures;
        localStorage.setItem(LS_FIXTURES, JSON.stringify(allFixtures));
        triggerFixturesListeners(leagueId);
      },
      'Update match score'
    );
  }
};

export const resetMatchScore = async (
  leagueId: string,
  matchId: string
) => {
  const fixtures = await getFixtures(leagueId);
  const index = fixtures.findIndex(m => m.id === matchId);
  if (index !== -1) {
    fixtures[index] = {
      ...fixtures[index],
      homeScore: null,
      awayScore: null,
      proposedHomeScore: null,
      proposedAwayScore: null,
      scoreStatus: null,
      isCompleted: false,
      submittedBy: null,
      isDisputed: false
    };

    await runDbOperation(
      async () => {
        await setDoc(doc(db!, 'fixtures', leagueId), { matches: fixtures });
      },
      async () => {
        const fixturesStr = localStorage.getItem(LS_FIXTURES) || '{}';
        const allFixtures = JSON.parse(fixturesStr);
        allFixtures[leagueId] = fixtures;
        localStorage.setItem(LS_FIXTURES, JSON.stringify(allFixtures));
        triggerFixturesListeners(leagueId);
      },
      'Reset match score'
    );
  }
};

// Save a room code for a specific match (set by home team)
export const saveMatchRoomCode = async (
  leagueId: string,
  matchId: string,
  roomCode: string
) => {
  const fixtures = await getFixtures(leagueId);
  const index = fixtures.findIndex(m => m.id === matchId);
  if (index === -1) return;

  fixtures[index] = { ...fixtures[index], roomCode };

  return runDbOperation(
    async () => {
      await setDoc(doc(db!, 'fixtures', leagueId), { matches: fixtures });
    },
    async () => {
      const fixturesStr = localStorage.getItem(LS_FIXTURES) || '{}';
      const allFixtures = JSON.parse(fixturesStr);
      allFixtures[leagueId] = fixtures;
      localStorage.setItem(LS_FIXTURES, JSON.stringify(allFixtures));
      triggerFixturesListeners(leagueId);
    },
    'Save match room code'
  );
};

// Reset a specific league's data
export const resetTournament = async (leagueId: string) => {
  const defaultLeague: LeagueSettings = {
    id: leagueId,
    name: '',
    teamCount: 4,
    wPoints: 3,
    dPoints: 1,
    lPoints: 0,
    status: 'setup',
    currentRound: 1,
    totalRounds: 0,
    championId: null
  };

  return runDbOperation(
    async () => {
      await setDoc(doc(db!, 'leagues', leagueId), defaultLeague);
      await deleteDoc(doc(db!, 'fixtures', leagueId));
      
      const teams = await getTeams();
      await Promise.all(
        Object.keys(teams)
          .filter(id => teams[id].leagueId === leagueId)
          .map(id => deleteDoc(doc(db!, 'teams', id)))
      );
    },
    async () => {
      const leagues = await getLeagues();
      leagues[leagueId] = defaultLeague;
      localStorage.setItem(LS_LEAGUES, JSON.stringify(leagues));

      const fixturesStr = localStorage.getItem(LS_FIXTURES) || '{}';
      const allFixtures = JSON.parse(fixturesStr);
      delete allFixtures[leagueId];
      localStorage.setItem(LS_FIXTURES, JSON.stringify(allFixtures));
      
      const teams = await getTeams();
      const updatedTeams: Record<string, Team> = {};
      Object.keys(teams).forEach(id => {
        if (teams[id].leagueId !== leagueId) {
          updatedTeams[id] = teams[id];
        }
      });
      localStorage.setItem(LS_TEAMS, JSON.stringify(updatedTeams));
      
      triggerLeaguesListeners();
      triggerTeamsListeners();
      triggerFixturesListeners(leagueId);
    },
    'Reset tournament'
  );
};

// Delete a tournament completely from the database
export const deleteLeague = async (leagueId: string) => {
  return runDbOperation(
    async () => {
      // 1. Delete league document from Firestore
      await deleteDoc(doc(db!, 'leagues', leagueId));
      
      // 2. Delete fixtures document
      await deleteDoc(doc(db!, 'fixtures', leagueId));
      
      // 3. Delete teams associated with this league
      const teams = await getTeams();
      await Promise.all(
        Object.keys(teams)
          .filter(id => teams[id].leagueId === leagueId)
          .map(id => deleteDoc(doc(db!, 'teams', id)))
      );
      
      // 4. If this league was active, clear active league config
      const activeId = await getActiveLeagueId();
      if (activeId === leagueId) {
        await saveActiveLeagueId(null);
      }
    },
    async () => {
      // 1. Delete from LS leagues
      const leagues = await getLeagues();
      delete leagues[leagueId];
      localStorage.setItem(LS_LEAGUES, JSON.stringify(leagues));

      // 2. Delete fixtures
      const fixturesStr = localStorage.getItem(LS_FIXTURES) || '{}';
      const allFixtures = JSON.parse(fixturesStr);
      delete allFixtures[leagueId];
      localStorage.setItem(LS_FIXTURES, JSON.stringify(allFixtures));
      
      // 3. Delete teams
      const teams = await getTeams();
      const updatedTeams: Record<string, Team> = {};
      Object.keys(teams).forEach(id => {
        if (teams[id].leagueId !== leagueId) {
          updatedTeams[id] = teams[id];
        }
      });
      localStorage.setItem(LS_TEAMS, JSON.stringify(updatedTeams));
      
      // 4. Check active league
      const activeIdStr = localStorage.getItem(LS_ACTIVE_LEAGUE_ID);
      const activeId = activeIdStr ? JSON.parse(activeIdStr) : null;
      if (activeId === leagueId) {
        localStorage.setItem(LS_ACTIVE_LEAGUE_ID, JSON.stringify(null));
        triggerActiveLeagueIdListeners();
      }
      
      triggerLeaguesListeners();
      triggerTeamsListeners();
      triggerFixturesListeners(leagueId);
    },
    'Delete tournament'
  );
};

// Real-time Database Listeners Subscriptions
export const subscribeToLeagues = (callback: ListenerCallback<Record<string, LeagueSettings>>) => {
  if (useFirebase && db) {
    const unsub = onSnapshot(collection(db, 'leagues'), (querySnapshot) => {
      const leagues: Record<string, LeagueSettings> = {};
      querySnapshot.forEach((doc) => {
        leagues[doc.id] = doc.data() as LeagueSettings;
      });
      callback(leagues);
    }, (error) => {
      console.warn("Leagues subscription error, falling back to mock:", error);
      useFirebase = false;
      localStorage.setItem('scores_force_mock_db', 'true');
      window.location.reload();
    });
    return unsub;
  } else {
    leaguesListeners.add(callback);
    getLeagues().then(callback);
    return () => {
      leaguesListeners.delete(callback);
    };
  }
};

export const subscribeToActiveLeagueId = (callback: ListenerCallback<string | null>) => {
  if (useFirebase && db) {
    const unsub = onSnapshot(doc(db, 'config', 'activeLeague'), (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data()?.leagueId as string) : null);
    }, (error) => {
      console.warn("Active league subscription error, falling back to mock:", error);
      useFirebase = false;
      localStorage.setItem('scores_force_mock_db', 'true');
      window.location.reload();
    });
    return unsub;
  } else {
    activeLeagueIdListeners.add(callback);
    getActiveLeagueId().then(callback);
    return () => {
      activeLeagueIdListeners.delete(callback);
    };
  }
};

export const subscribeToTeams = (callback: ListenerCallback<Record<string, Team>>) => {
  if (useFirebase && db) {
    const unsub = onSnapshot(collection(db, 'teams'), (querySnapshot) => {
      const teams: Record<string, Team> = {};
      querySnapshot.forEach((doc) => {
        teams[doc.id] = doc.data() as Team;
      });
      callback(teams);
    }, (error) => {
      console.warn("Teams subscription error, falling back to mock:", error);
      useFirebase = false;
      localStorage.setItem('scores_force_mock_db', 'true');
      window.location.reload();
    });
    return unsub;
  } else {
    teamsListeners.add(callback);
    getTeams().then(callback);
    return () => {
      teamsListeners.delete(callback);
    };
  }
};

export const subscribeToFixtures = (leagueId: string | null, callback: ListenerCallback<Match[]>) => {
  if (!leagueId) {
    callback([]);
    return () => {};
  }
  if (useFirebase && db) {
    const unsub = onSnapshot(doc(db, 'fixtures', leagueId), (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data()?.matches as Match[]) : []);
    }, (error) => {
      console.warn("Fixtures subscription error, falling back to mock:", error);
      useFirebase = false;
      localStorage.setItem('scores_force_mock_db', 'true');
      window.location.reload();
    });
    return unsub;
  } else {
    const listenerWrapper = (data: Match[]) => {
      callback(data);
    };
    fixturesListeners.add(listenerWrapper);
    getFixtures(leagueId).then(callback);
    return () => {
      fixturesListeners.delete(listenerWrapper);
    };
  }
};

// Helper trigger calls for Local Storage modes
const triggerLeaguesListeners = () => {
  getLeagues().then(data => leaguesListeners.forEach(cb => cb(data)));
};

const triggerActiveLeagueIdListeners = () => {
  getActiveLeagueId().then(data => activeLeagueIdListeners.forEach(cb => cb(data)));
};

const triggerTeamsListeners = () => {
  getTeams().then(data => teamsListeners.forEach(cb => cb(data)));
};

const triggerFixturesListeners = (leagueId: string) => {
  getFixtures(leagueId).then(data => fixturesListeners.forEach(cb => {
    cb(data);
  }));
};

// Seed utility to speed up demo/testing in mock mode
export const seedDemoTournament = async () => {
  // Disabled as per user request to disable seeding
  return;
};

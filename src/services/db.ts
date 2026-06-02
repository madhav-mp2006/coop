import type { Team, Match, LeagueSettings } from './firebase';

/**
 * Generates fixtures using the Round Robin Circle Rotation algorithm.
 * For N teams, generates N-1 rounds (even) or N rounds (odd).
 */
export function generateRoundRobinFixtures(teams: Team[]): Match[] {
  const numTeams = teams.length;
  if (numTeams < 2) return [];

  const isOdd = numTeams % 2 !== 0;
  const n = isOdd ? numTeams + 1 : numTeams;
  
  // Clone list of teams
  const list = [...teams];
  if (isOdd) {
    // Add dummy bye team
    list.push({
      id: 'BYE',
      leagueId: '',
      name: 'BYE',
      color: '',
      captainUid: '',
      captainEmail: '',
      status: 'approved',
      players: []
    });
  }

  const fixtures: Match[] = [];
  const rounds = n - 1;
  const matchesPerRound = n / 2;

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < matchesPerRound; i++) {
      const home = list[i];
      const away = list[n - 1 - i];

      // Exclude BYE matches from actual schedule
      if (home.id !== 'BYE' && away.id !== 'BYE') {
        // Alternate home/away sides for fairness
        const isHome = (r + i) % 2 === 0;
        fixtures.push({
          id: `match-${r + 1}-${i + 1}`,
          leagueId: home.leagueId || '',
          round: r + 1,
          homeTeamId: isHome ? home.id : away.id,
          awayTeamId: isHome ? away.id : home.id,
          homeScore: null,
          awayScore: null,
          isCompleted: false,
          submittedBy: null,
          isDisputed: false
        });
      }
    }
    
    // Rotate list: keep index 0 fixed, move last element to index 1
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  // Shuffle slightly or sort by round to ensure clean order
  return fixtures.sort((a, b) => (a.round as number) - (b.round as number));
}

export interface StandingRow {
  pos: number;
  teamId: string;
  teamName: string;
  color: string;
  flagCode?: string;
  p: number; // Played
  w: number; // Wins
  d: number; // Draws
  l: number; // Losses
  gf: number; // Goals For
  ga: number; // Goals Against
  gd: number; // Goal Difference
  pts: number; // Points
}

/**
 * Calculates league standings based on approved teams and round-robin matches.
 */
export function calculateStandings(
  teams: Record<string, Team>,
  fixtures: Match[],
  settings: LeagueSettings
): StandingRow[] {
  const stats: Record<string, Omit<StandingRow, 'pos' | 'teamName' | 'color'>> = {};

  // Initialize stats for approved teams
  Object.values(teams).forEach((team) => {
    if (team.status === 'approved' && team.leagueId === settings.id) {
      stats[team.id] = {
        teamId: team.id,
        p: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      };
    }
  });

  // Calculate stats from completed round-robin matches
  fixtures.forEach((match) => {
    // Only calculate for round robin matches (numeric round)
    if (typeof match.round === 'number' && match.isCompleted && match.homeScore !== null && match.awayScore !== null) {
      const homeStats = stats[match.homeTeamId];
      const awayStats = stats[match.awayTeamId];

      // If one of the teams is not approved or deleted, skip
      if (!homeStats || !awayStats) return;

      const hs = match.homeScore;
      const as = match.awayScore;

      homeStats.p += 1;
      awayStats.p += 1;

      homeStats.gf += hs;
      homeStats.ga += as;
      awayStats.gf += as;
      awayStats.ga += hs;

      homeStats.gd = homeStats.gf - homeStats.ga;
      awayStats.gd = awayStats.gf - awayStats.ga;

      if (hs > as) {
        homeStats.w += 1;
        homeStats.pts += settings.wPoints;

        awayStats.l += 1;
        awayStats.pts += settings.lPoints;
      } else if (hs < as) {
        awayStats.w += 1;
        awayStats.pts += settings.wPoints;

        homeStats.l += 1;
        homeStats.pts += settings.lPoints;
      } else {
        homeStats.d += 1;
        homeStats.pts += settings.dPoints;

        awayStats.d += 1;
        awayStats.pts += settings.dPoints;
      }
    }
  });

  // Map to final rows with team names and badge colors
  const standings: StandingRow[] = Object.values(stats).map((stat) => {
    const team = teams[stat.teamId];
    return {
      ...stat,
      teamName: team ? team.name : 'Unknown Team',
      color: team ? team.color : '#10b981',
      flagCode: team ? team.flagCode : '',
      pos: 0 // Will populate after sorting
    };
  });

  // Sort: 
  // 1. Points (descending)
  // 2. Goal Difference (descending)
  // 3. Goals For (descending)
  // 4. Alphabetical
  standings.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.teamName.localeCompare(b.teamName);
  });

  // Add position numbers (1-indexed)
  return standings.map((row, idx) => ({
    ...row,
    pos: idx + 1
  }));
}

/**
 * Pure vote-maths for suggestions.
 *
 * The quorum is derived from how many members were actually active recently,
 * so a quiet week needs fewer votes than a busy one. Activity comes from
 * user_levels.last_xp_gain, which every message already stamps.
 */

export const DEFAULT_SUGGESTION_SETTINGS = {
    duration_hours: 48,
    activity_window_days: 14,
    participation_pct: 20,
    min_votes: 3,
    max_votes: 15,
    pass_ratio_pct: 60,
    reject_ratio_pct: 40,
};

/**
 * How many votes this suggestion needs before the ratio means anything.
 */
export function computeRequiredVotes(activeMembers, settings = DEFAULT_SUGGESTION_SETTINGS) {
    const active = Math.max(0, Math.floor(activeMembers || 0));
    const share = Math.ceil((active * settings.participation_pct) / 100);
    return Math.min(settings.max_votes, Math.max(settings.min_votes, share));
}

/**
 * Verdict for a closed suggestion.
 *
 * Returns one of: no_quorum, passed, rejected, undecided — plus the numbers
 * the verdict was based on, so the embed can show its working.
 */
export function computeVerdict({ up, down, activeMembers, settings = DEFAULT_SUGGESTION_SETTINGS }) {
    const upvotes = Math.max(0, up || 0);
    const downvotes = Math.max(0, down || 0);
    const total = upvotes + downvotes;
    const required = computeRequiredVotes(activeMembers, settings);
    const ratioPct = total > 0 ? (upvotes / total) * 100 : 0;

    let status;
    if (total < required) {
        status = 'no_quorum';
    } else if (ratioPct >= settings.pass_ratio_pct) {
        status = 'passed';
    } else if (ratioPct <= settings.reject_ratio_pct) {
        status = 'rejected';
    } else {
        status = 'undecided';
    }

    return { status, up: upvotes, down: downvotes, total, required, ratioPct, activeMembers };
}

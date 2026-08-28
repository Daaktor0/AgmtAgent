/**
 * SPEC §5.5: a user “not a defect” vote creates a human-review ticket.
 * It MUST NOT suppress the check for that user or globally.
 */
export function voteNotADefectDoesNotSuppress(suppressionCode: string): boolean {
  return suppressionCode !== "not_a_defect" && suppressionCode !== "user_vote";
}

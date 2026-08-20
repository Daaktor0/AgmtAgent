/**
 * Comment actions by stable id. All mutation still requires Agmt approval.
 *
 * Stable-id lookup / reply / resolve adapted from Vaquill AI ms-word-addin
 * (Apache-2.0). Uses body.getComments (WordApi 1.5), not document.comments.
 */
import { runWord } from "./host";

async function findComment(context: Word.RequestContext, id: string): Promise<Word.Comment | null> {
  const comments = context.document.body.getComments();
  comments.load("id");
  await context.sync();
  return comments.items.find((c) => c.id === id) ?? null;
}

export async function locateComment(id: string): Promise<boolean> {
  return runWord(async (context) => {
    const comment = await findComment(context, id);
    if (!comment) return false;
    comment.getRange().select();
    await context.sync();
    return true;
  });
}

export async function resolveComment(id: string, resolved = true): Promise<boolean> {
  return runWord(async (context) => {
    const comment = await findComment(context, id);
    if (!comment) return false;
    comment.resolved = resolved;
    await context.sync();
    return true;
  });
}

export async function replyToComment(id: string, text: string): Promise<boolean> {
  const body = text.trim();
  if (!body) return false;
  return runWord(async (context) => {
    const comment = await findComment(context, id);
    if (!comment) return false;
    comment.reply(body);
    await context.sync();
    return true;
  });
}

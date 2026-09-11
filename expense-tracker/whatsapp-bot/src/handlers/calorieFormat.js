function round(n) {
  return n == null ? null : Math.round(n);
}

export function formatFoodReply({ name, parsed, imageSaved }) {
  const who = name ? ` for ${name}` : '';
  const lines = [`🍽️ Logged${who}`, `~${round(parsed.calories)} kcal`];

  if (parsed.protein_g != null || parsed.carbs_g != null || parsed.fat_g != null) {
    lines.push(`P ${round(parsed.protein_g) ?? 0}g · C ${round(parsed.carbs_g) ?? 0}g · F ${round(parsed.fat_g) ?? 0}g`);
  }

  for (const item of (parsed.items || []).slice(0, 8)) {
    const kcal = item.calories != null ? ` (~${round(item.calories)})` : '';
    lines.push(`• ${item.name}${kcal}`);
  }

  if (imageSaved) lines.push('Image: saved');

  const inTok = parsed.usage?.input_tokens || 0;
  const outTok = parsed.usage?.output_tokens || 0;
  const cost = (inTok * 0.000003 + outTok * 0.000015).toFixed(6);
  lines.push(`Confidence ${Math.round((parsed.confidence || 0) * 100)}% | Tokens ${inTok}/${outTok} (~$${cost})`);

  return lines.join('\n');
}

export function formatTodaySummary(summaryRow) {
  if (!summaryRow || !summaryRow.total_calories) {
    return 'No food logged today. Send a photo of your meal to track it.';
  }
  const name = summaryRow.sender_name || 'You';
  return [
    `🍽️ ${name} — today`,
    `~${round(summaryRow.total_calories)} kcal`,
    `P ${round(summaryRow.total_protein_g) ?? 0}g · C ${round(summaryRow.total_carbs_g) ?? 0}g · F ${round(summaryRow.total_fat_g) ?? 0}g`,
    `${summaryRow.entry_count} meal(s) logged`
  ].join('\n');
}

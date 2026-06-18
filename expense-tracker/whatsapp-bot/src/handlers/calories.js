import { createCalorieEntry, uploadImage } from '../services/api.js';
import { reply } from '../utils/message.js';
import { formatFoodReply } from './calorieFormat.js';

const MAX_REASONABLE_KCAL = 20000;

export async function handleFoodImage(sock, msg, jid, parsed, base64, senderId, senderName) {
  if (!parsed.calories || parsed.calories <= 0 || parsed.calories > MAX_REASONABLE_KCAL) {
    return reply(sock, jid, "I see food but couldn't estimate calories reliably. Try a clearer, closer photo of the meal.", msg);
  }

  const meta = { sender: jid, messagePreview: '(food image)' };

  let imageUrl = null;
  try {
    const uploadResult = await uploadImage(base64, `food_${Date.now()}.jpg`, meta);
    imageUrl = uploadResult.image_url;
  } catch (error) {
    console.error('Failed to save food image:', error);
  }

  await createCalorieEntry({
    sender_id: senderId,
    sender_name: senderName || null,
    description: parsed.description || null,
    calories: parsed.calories,
    protein_g: parsed.protein_g ?? null,
    carbs_g: parsed.carbs_g ?? null,
    fat_g: parsed.fat_g ?? null,
    items: Array.isArray(parsed.items) ? parsed.items : null,
    confidence: parsed.confidence ?? null,
    image_url: imageUrl,
    date: parsed.date || new Date().toISOString().split('T')[0]
  }, meta);

  await reply(sock, jid, formatFoodReply({ name: senderName, parsed, imageSaved: !!imageUrl }), msg);
}

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isCommandAllowed } from '../utils/validation.js';
import { getExpenseSummary, getDailyStats, getMonthlyStats, createExpense } from '../utils/expenseApi.js';

function idr(amount) {
    return `Rp ${Number(amount || 0).toLocaleString('id-ID')}`;
}

function today() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

const data = new SlashCommandBuilder()
    .setName('expense')
    .setDescription('Check your expenses from the expense tracker')
    .addSubcommand(sub =>
        sub.setName('today')
            .setDescription('Show today\'s spending'))
    .addSubcommand(sub =>
        sub.setName('month')
            .setDescription('Show this month\'s spending breakdown'))
    .addSubcommand(sub =>
        sub.setName('summary')
            .setDescription('Show overall spending summary')
            .addStringOption(opt =>
                opt.setName('period')
                    .setDescription('Time period')
                    .addChoices(
                        { name: 'This week', value: 'week' },
                        { name: 'This month', value: 'month' },
                        { name: 'This year', value: 'year' },
                    )))
    .addSubcommand(sub =>
        sub.setName('log')
            .setDescription('Quick-log an expense from Discord')
            .addNumberOption(opt =>
                opt.setName('amount')
                    .setDescription('Amount in IDR')
                    .setRequired(true))
            .addStringOption(opt =>
                opt.setName('description')
                    .setDescription('What was it for?')
                    .setRequired(true))
            .addStringOption(opt =>
                opt.setName('vendor')
                    .setDescription('Where? (optional)')));

async function execute(interaction) {
    const validation = isCommandAllowed(interaction, 'ALLOWED_EXPENSE_USERS', 'EXPENSE_CHANNEL_ID');
    if (!validation.allowed) {
        return interaction.reply({
            content: validation.reason,
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    try {
        switch (sub) {
            case 'today': return await handleToday(interaction);
            case 'month': return await handleMonth(interaction);
            case 'summary': return await handleSummary(interaction);
            case 'log': return await handleLog(interaction);
        }
    } catch (error) {
        console.error('[ERROR] Expense command error:', error);
        const msg = error.message?.includes('Expense API')
            ? '❌ Could not reach the expense tracker. Is it running?'
            : `❌ Something went wrong: ${error.message?.slice(0, 200)}`;
        await interaction.editReply({ content: msg });
    }
}

export default {
    data,
    execute,
};

async function handleToday(interaction) {
    const date = today();
    const [daily, summary] = await Promise.all([
        getDailyStats({ startDate: date, endDate: date }),
        getExpenseSummary({ startDate: date, endDate: date }),
    ]);

    const dayData = daily[0] || { expenses: 0, income: 0, net: 0, count: 0 };

    const categoryLines = (summary.byCategory || [])
        .filter(c => Number(c.total) > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map(c => `${c.icon || '📦'} ${c.name}: ${idr(c.total)} (${c.count}x)`)
        .join('\n') || '_No expenses yet_';

    await interaction.editReply({
        embeds: [{
            color: 0xF59E0B,
            title: `💰 Today's Expenses — ${date}`,
            fields: [
                { name: '💸 Spent', value: idr(dayData.expenses), inline: true },
                { name: '💵 Income', value: idr(dayData.income), inline: true },
                { name: '📊 Net', value: idr(dayData.net), inline: true },
                { name: `📋 Breakdown (${dayData.count || 0} transactions)`, value: categoryLines },
            ],
            footer: { text: 'Data from expense-tracker' },
            timestamp: new Date().toISOString(),
        }],
    });
}

async function handleMonth(interaction) {
    const year = new Date().getFullYear();
    const month = new Date().getMonth(); // 0-indexed
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const startDate = `${monthStr}-01`;
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [monthly, summary] = await Promise.all([
        getMonthlyStats({ year }),
        getExpenseSummary({ startDate, endDate }),
    ]);

    const monthData = monthly.find(m => m.month === monthStr) || { expenses: 0, income: 0, net: 0, count: 0 };

    const categoryLines = (summary.byCategory || [])
        .filter(c => Number(c.total) > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
        .map(c => `${c.icon || '📦'} ${c.name}: ${idr(c.total)}`)
        .join('\n') || '_No data_';

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    await interaction.editReply({
        embeds: [{
            color: 0x3B82F6,
            title: `📅 ${monthNames[month]} ${year} Expenses`,
            fields: [
                { name: '💸 Total Spent', value: idr(monthData.expenses), inline: true },
                { name: '💵 Income', value: idr(monthData.income), inline: true },
                { name: '📊 Net', value: idr(monthData.net), inline: true },
                { name: `📋 By Category (${monthData.count || 0} transactions)`, value: categoryLines },
            ],
            footer: { text: 'Data from expense-tracker' },
            timestamp: new Date().toISOString(),
        }],
    });
}

async function handleSummary(interaction) {
    const period = interaction.options.getString('period') || 'month';
    const now = new Date();
    let startDate, endDate, label;

    switch (period) {
        case 'week': {
            const d = new Date(now);
            d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
            startDate = d.toISOString().split('T')[0];
            endDate = today();
            label = 'This Week';
            break;
        }
        case 'month': {
            startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            endDate = today();
            label = 'This Month';
            break;
        }
        case 'year': {
            startDate = `${now.getFullYear()}-01-01`;
            endDate = today();
            label = `${now.getFullYear()}`;
            break;
        }
    }

    const summary = await getExpenseSummary({ startDate, endDate });

    const categoryLines = (summary.byCategory || [])
        .filter(c => Number(c.total) > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
        .map(c => `${c.icon || '📦'} **${c.name}**: ${idr(c.total)} (${c.count}x)`)
        .join('\n') || '_No data_';

    await interaction.editReply({
        embeds: [{
            color: 0x10B981,
            title: `📊 Expense Summary — ${label}`,
            description: `${startDate} to ${endDate}`,
            fields: [
                { name: '💸 Expenses', value: idr(summary.expenses), inline: true },
                { name: '💵 Income', value: idr(summary.income), inline: true },
                { name: '📊 Net', value: idr(summary.net), inline: true },
                { name: '🔢 Transactions', value: `${summary.count || 0}`, inline: true },
                { name: '📋 By Category', value: categoryLines },
            ],
            footer: { text: 'Data from expense-tracker' },
            timestamp: new Date().toISOString(),
        }],
    });
}

async function handleLog(interaction) {
    const amount = interaction.options.getNumber('amount');
    const description = interaction.options.getString('description');
    const vendor = interaction.options.getString('vendor') || undefined;

    const result = await createExpense({
        amount,
        date: today(),
        description,
        vendor,
        type: 'expense',
        source: 'discord',
    });

    await interaction.editReply({
        embeds: [{
            color: 0x22C55E,
            title: '✅ Expense Logged',
            fields: [
                { name: 'Amount', value: idr(amount), inline: true },
                { name: 'Description', value: description, inline: true },
                ...(vendor ? [{ name: 'Vendor', value: vendor, inline: true }] : []),
                { name: 'Date', value: today(), inline: true },
            ],
            footer: { text: `ID: ${result.id || 'saved'} • via Discord` },
            timestamp: new Date().toISOString(),
        }],
    });
}

import { formatterService } from '../src/formatter';

const sampleInput = `IP-адрес сервера Minecraft SkyBlock ATM 10: **158.180.47.202**

Дополнительная информация из контекста:
*   **Домен:** \`sky.onter.pp.ua\`
*   **Хост:** Oracle Cloud 2 (Free)
*   **SSH порт:** 22 (для административного доступа)`;

console.log('--- RAW INPUT ---');
console.log(sampleInput);

console.log('\n--- TELEGRAM FORMAT (HTML) ---');
const telegramResult = formatterService.format(sampleInput, 'telegram');
console.log(telegramResult);

console.log('\n--- MINECRAFT FORMAT (SINGLE LINE) ---');
const minecraftResult = formatterService.format(sampleInput, 'minecraft');
console.log(minecraftResult);

console.log('\n--- DISCORD FORMAT ---');
const discordResult = formatterService.format(sampleInput, 'discord');
console.log(discordResult);

console.log('\n--- PLAIN TEXT FORMAT ---');
const plainResult = formatterService.format(sampleInput, 'plaintext');
console.log(plainResult);

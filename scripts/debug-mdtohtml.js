// Debug: test mdToHtml with mentions
function mdToHtml(text, mentions) {
    const atTags = [];
    text = text.replace(/<at>(.+?)<\/at>/g, (match) => {
      const key = '\x00AT' + atTags.length + '\x00';
      atTags.push(match);
      return key;
    });

    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(?<!\*)_(.+?)_(?!\*)/g, '<i>$1</i>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
      .replace(/\n/g, '<br>');

    html = html.replace(/\x00AT(\d+)\x00/g, (_, idx) => {
      const midx = parseInt(idx);
      if (mentions && midx < mentions.length) {
        return '<at id="' + mentions[midx].id + '">' + mentions[midx].mentionText + '</at>';
      }
      return '<at>mencionado</at>';
    });
    return html;
}

const graphMentions = [
  { id: 0, mentionText: 'Bruno Damasceno' },
  { id: 1, mentionText: 'Igor Franklin G. Gomes' }
];

const text = '**Titulo**\n\nTeste <at>Bruno Damasceno</at> e <at>Igor Franklin G. Gomes</at>';

console.log('=== mentions ===');
console.log(JSON.stringify(graphMentions));
console.log('');

const result = mdToHtml(text, graphMentions);
console.log('=== OUTPUT HTML ===');
console.log(result);
console.log('');

console.log('Contains <at id="0"> ?', result.includes('<at id="0">'));
console.log('Contains <at id="1"> ?', result.includes('<at id="1">'));

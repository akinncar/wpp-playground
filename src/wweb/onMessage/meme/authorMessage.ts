import Jimp from 'jimp';
import { logger } from 'src/telemetry/logger';
import { PreparedEvent } from 'src/telemetry/preparedEvent';
import { Message, MessageMedia } from 'whatsapp-web.js';
import { getBase64 } from '../../../jimp/getBase64';
import { splitTextIntoLines } from '../../../jimp/strings';
import { middleware } from '../../middleware/middleware';
import COMMANDS from '../commands';

const authorMessage = async (msg: Message, preparedEvent: PreparedEvent) => {
  try {
    const quote = await msg.getQuotedMessage();

    const contact = await (quote || msg).getContact();
    const profilePic = await contact.getProfilePicUrl();
    if (!profilePic) {
      return msg.reply(
        "The author of the message doesn't have a profile picture.",
      );
    }
    const image = await Jimp.read(profilePic);

    let text = msg.body.replace('!author', '').trim();
    // Checks if the message contains any body text to be sent along with the author image. If it has, then the text will be used.
    // If not, then the text from the quoted message will be used.
    // If the quoted message doesn't have any text, then the author image will be sent as a sticker. And the function will be short-circuited.
    if (!text) {
      if (!quote?.body) {
        const base64 = await getBase64(Jimp.MIME_JPEG, image);
        return msg.reply(new MessageMedia('image/jpeg', base64), undefined, {
          sendMediaAsSticker: true,
        });
      }
      text = quote?.body.replace('!author', '').trim() || '';
    }

    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const lines = splitTextIntoLines(text, font, image.bitmap.width);
    const textHeight = Jimp.measureTextHeight(font, 'M', image.bitmap.width);

    // Define the initial y coordinate for the first line of text
    let y =
      image.bitmap.height -
      lines.length * textHeight - // Height of all lines of text. Using "M" as reference character.
      10; // 10 is margin from bottom

    // Print each line of text on the image
    lines.forEach((line) => {
      const lineWidth = Jimp.measureText(font, line);
      const x = (image.bitmap.width - lineWidth) / 2;
      image.print(font, x, y, line);
      y += textHeight;
    });

    const base64 = await getBase64(Jimp.MIME_JPEG, image);

    preparedEvent.patchMetadata({
      width: image.bitmap.width,
      height: image.bitmap.height,
      textSize: text.length,
      lines: lines.length,
    });

    msg.reply(new MessageMedia('image/jpeg', base64), undefined, {
      sendMediaAsSticker: true,
    });
  } catch (error) {
    logger.error(error);
    // @ts-expect-error: error is unknown
    msg.reply('An error occured while processing the image. ', error?.message);
  }
};

export default middleware(authorMessage, {
  cost: COMMANDS.AUTHOR.cost,
});

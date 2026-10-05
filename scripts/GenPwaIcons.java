import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;

public class GenPwaIcons {
    public static void main(String[] args) throws Exception {
        File srcFile = new File("public/icon-192.png");
        BufferedImage src = ImageIO.read(srcFile);
        System.out.println("Loaded " + srcFile.getPath() + " (" + src.getWidth() + "x" + src.getHeight() + ")");

        int[][] sizes = {
            {512, 512},
            {180, 180}, // Apple touch icon
            {144, 144},
            {96, 96},
            {72, 72},
            {48, 48}
        };

        for (int[] sz : sizes) {
            int w = sz[0], h = sz[1];
            BufferedImage scaled = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g2 = scaled.createGraphics();
            g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g2.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.drawImage(src, 0, 0, w, h, null);
            g2.dispose();

            String name = (w == 180) ? "apple-touch-icon.png" : "icon-" + w + ".png";
            File outFile = new File("public/" + name);
            ImageIO.write(scaled, "png", outFile);
            System.out.println("Created " + outFile.getPath() + " (" + w + "x" + h + ")");
        }
        System.out.println("All PWA icons generated successfully!");
    }
}

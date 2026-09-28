import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;

public class ResizeIcons {
    public static void main(String[] args) throws Exception {
        File srcFile = new File("public/stitch/stitch_vyapar_billing_app_redesign/vyapar_modern_logo/screen.png");
        BufferedImage src = ImageIO.read(srcFile);
        System.out.println("Source icon loaded: " + src.getWidth() + "x" + src.getHeight());

        int[][] targets = {
            {48, 48, 1},   // mdpi
            {72, 72, 2},   // hdpi
            {96, 96, 3},   // xhdpi
            {144, 144, 4}, // xxhdpi
            {192, 192, 5}  // xxxhdpi
        };

        String[] folders = {
            "mipmap-mdpi",
            "mipmap-hdpi",
            "mipmap-xhdpi",
            "mipmap-xxhdpi",
            "mipmap-xxxhdpi"
        };

        for (int i = 0; i < targets.length; i++) {
            int w = targets[i][0];
            int h = targets[i][1];
            String folder = folders[i];

            BufferedImage scaled = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g2 = scaled.createGraphics();
            g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g2.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.drawImage(src, 0, 0, w, h, null);
            g2.dispose();

            File outDir = new File("android-native/app/src/main/res/" + folder);
            outDir.mkdirs();

            File launcher = new File(outDir, "ic_launcher.png");
            File round = new File(outDir, "ic_launcher_round.png");

            ImageIO.write(scaled, "png", launcher);
            ImageIO.write(scaled, "png", round);
            System.out.println("Generated icons for " + folder + " (" + w + "x" + h + ")");
        }

        // Also copy into public for web assets
        ImageIO.write(src, "png", new File("public/icon-192.png"));
        System.out.println("Done resizing all Stitch icons!");
    }
}

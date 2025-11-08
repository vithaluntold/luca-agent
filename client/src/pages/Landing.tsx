import LandingNav from "@/components/LandingNav";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import ModelArchitecture from "@/components/ModelArchitecture";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <LandingNav />
      <Hero />
      <Features />
      <ModelArchitecture />
      <Pricing />
      <Testimonials />
      <Footer />
    </div>
  );
}

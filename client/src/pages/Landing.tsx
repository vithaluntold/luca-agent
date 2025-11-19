import LandingNav from "@/components/LandingNav";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import ProfessionalModes from "@/components/ProfessionalModes";
import ModelArchitecture from "@/components/ModelArchitecture";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <LandingNav />
      <Hero />
      <Features />
      <ProfessionalModes />
      <ModelArchitecture />
      <Pricing />
      <Footer />
    </div>
  );
}

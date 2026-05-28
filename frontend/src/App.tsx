import { BrowserRouter, Route, Routes } from "react-router-dom";
import Section1Paper from "./pages/Section1Paper";

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Section1Paper />} />
      </Routes>
    </BrowserRouter>
  );
}

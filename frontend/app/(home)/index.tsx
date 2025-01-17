// app/(home)/index.tsx
import { View } from "react-native";
import { AudioRecorder } from "@/app/components/audio/AudioRecorder";

export default function RecordScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <AudioRecorder onRecordingComplete={(uri) => console.log(uri)} />
    </View>
  );
}

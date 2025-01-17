import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { ENV } from "../config";
import { Audio } from 'expo-av';
import { TouchableOpacity } from 'react-native';
import * as FileSystem from "expo-file-system";
import { themeColors } from "../colors";
interface Utterance {
  id: string;
  speaker: string;
  transcript: string;
  start: number;
  end: number;
}

interface RecordingDetailsData {
  id: string;
  title: string;
  createdAt: string;
  duration: number;
  summary?: string;
  transcript?: string;
  utterances?: Utterance[];
  recordingUrl: string;
}

export default function RecordingDetails({
  recordingId,
}: {
  recordingId: string;
}) {
  const { colors } = useTheme();
  const { getToken } = useAuth();

  // transcript and summary
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingDetails, setRecordingDetails] = useState<RecordingDetailsData | null>(null);

  // audio player
  const [sound, setSound] = useState<Audio.Sound>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // audio player progress bar
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    // configure ios audio settings
    const configureAudio = async () => {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    };
    configureAudio();
  }, []);

  useEffect(() => {
    fetchRecordingDetails();
  }, []);

  useEffect(() => {
    if (recordingDetails?.recordingUrl) {
      downloadAudio(recordingDetails.recordingUrl);
    }
  }, [recordingDetails?.recordingUrl]);

  // unload audio when component unmounts
  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const downloadAudio = async (url: string) => {
    try {
      setIsLoadingAudio(true);
      const fileUri = FileSystem.documentDirectory + recordingDetails!.id + '.m4a';
      console.log(`fileUri`, fileUri);
      await FileSystem.downloadAsync(url, fileUri);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: false },
        (status) => {
          // Update position and duration when playback status changes
          if (status.isLoaded) {
            setPosition(status.positionMillis);
            setDuration(status.durationMillis || 0);
          }
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        }
      );
      setSound(newSound);
    } catch (error) {
      console.error('Error downloading audio:', error);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const playRecording = async () => {
    try {
      if (sound) {
        if (isPlaying) {
          console.log(`pausing sound`);
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          console.log(`playing sound`);
          await sound.playAsync();
          setIsPlaying(true);
        }
      } else {
        console.log(`no sound to play`);
      }
    } catch (error) {
      console.error('Error playing recording:', error);
    }
  };

  const fetchRecordingDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await getToken();
      const response = await fetch(`${ENV.prod}/recordings/${recordingId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch recording details");
      }

      const data = await response.json();
      console.log(`recording details`, data);
      setRecordingDetails(data.data);
    } catch (error) {
      console.error("Error fetching recording details:", error);
      setError("Failed to load recording details");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long", // "Monday"
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true, // for AM/PM
    });
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };
  // for audio player progress bar
  const formatTime = (millis: number) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = Math.floor((millis % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const isUtterances = recordingDetails?.utterances && recordingDetails.utterances.length > 0;

  return (
    <>
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText]}>
            {error}
          </Text>
        </View>
      ) : recordingDetails ? (
        <>
          <ScrollView
            style={[styles.container]}
          >
            {/* Header Section */}
            <View style={styles.headerSection}>
              <Text style={[styles.title]}>
                {recordingDetails.title}
              </Text>
              <View style={styles.metadataContainer}>
                <View style={styles.dateTimeContainer}>
                  <Text style={[styles.metadata]}>
                    {formatDate(recordingDetails.createdAt)}
                  </Text>
                </View>
                <View style={styles.durationContainer}>
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={colors.text + "80"}
                    style={styles.timeIcon}
                  />
                  <Text style={[styles.duration]}>
                    {formatDuration(recordingDetails.duration)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Summary Section */}
            {recordingDetails.summary && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle]}>
                  Summary
                </Text>
                <View
                  style={[
                    styles.card,
                    {
                      //backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text style={[styles.sectionContent]}>
                    {recordingDetails.summary}
                  </Text>
                </View>
              </View>
            )}

            {/* Utterances Section */}
            {recordingDetails.utterances &&
              recordingDetails.utterances.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle]}>
                    Conversation
                  </Text>
                  {recordingDetails.utterances.map((utterance, index) => (
                    <View
                      key={index}
                      style={[
                        styles.card,
                        {
                          //backgroundColor: colors.card,
                          borderColor: colors.border,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <View style={styles.utteranceHeader}>
                        <Text
                          style={[styles.speakerText]}
                        >
                          Speaker {utterance.speaker}
                        </Text>
                        <Text
                          style={[styles.timeText]}
                        >
                          {formatDuration(utterance.start)}
                        </Text>
                      </View>
                      <Text
                        style={[styles.utteranceText]}
                      >
                        {utterance.transcript}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

          </ScrollView>
          <View style={[styles.playerContainer]}>
            <TouchableOpacity onPress={playRecording}>
              <Ionicons
                name={isLoadingAudio ? "hourglass-outline" : isPlaying ? "pause-circle" : "play-circle"}
                size={48}
                color={themeColors.text}
              />
            </TouchableOpacity>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progress,
                    {
                      width: `${(position / duration) * 100}%`,
                      backgroundColor: colors.primary
                    }
                  ]}
                />
              </View>
              <View style={styles.timeContainer}>
                <Text style={[styles.timeText]}>
                  {formatTime(position)}
                </Text>
                <Text style={[styles.timeText]}>
                  {formatTime(duration)}
                </Text>
              </View>
            </View>
          </View>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  playerContainer: {
    backgroundColor: themeColors.background,
    color: themeColors.text,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  progressContainer: {
    flex: 1,
    marginTop: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progress: {
    height: '100%',
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: themeColors.text,
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: themeColors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: themeColors.background,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    padding: 16,
    color: themeColors.text,
  },
  headerSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 12,
    color: themeColors.text,
  },
  metadataContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateTimeContainer: {
    flex: 1,
  },
  metadata: {
    fontSize: 13,
    color: themeColors.textSecondary,
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeIcon: {
    marginHorizontal: 4,
  },
  duration: {
    fontSize: 13,
    marginLeft: 4,
    color: themeColors.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
    color: themeColors.text,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  sectionContent: {
    fontSize: 16,
    lineHeight: 24,
    color: themeColors.text,
  },
  utteranceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  speakerText: {
    fontSize: 16,
    fontWeight: "600",
    color: themeColors.text,
  },
  utteranceText: {
    fontSize: 16,
    lineHeight: 24,
    color: themeColors.text,
  },
});
